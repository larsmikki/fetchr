import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  deleteOfflineVideo,
  getOfflineVideo,
  hasOfflineVideo,
  listOfflineVideoIds,
  putOfflineVideo,
} from './db'

export type OfflineState =
  | { status: 'absent' }
  | { status: 'downloading'; progress: number }
  | { status: 'available'; size: number }
  | { status: 'error'; message: string }

type Listener = () => void

const ABSENT: OfflineState = { status: 'absent' }
const states = new Map<number, OfflineState>()
const listeners = new Map<number, Set<Listener>>()
const inflight = new Map<number, AbortController>()
let initialized = false
let initPromise: Promise<void> | null = null

function notify(id: number): void {
  const set = listeners.get(id)
  if (!set) return
  for (const fn of set) fn()
}

function setState(id: number, state: OfflineState): void {
  states.set(id, state)
  notify(id)
}

async function hydrate(): Promise<void> {
  if (initialized) return
  if (initPromise) return initPromise
  initPromise = (async () => {
    try {
      const ids = await listOfflineVideoIds()
      for (const id of ids) {
        const rec = await getOfflineVideo(id)
        if (rec) states.set(id, { status: 'available', size: rec.size })
      }
    } catch (err) {
      console.warn('[offline] hydrate failed:', err)
    }
    initialized = true
    for (const id of states.keys()) notify(id)
  })()
  return initPromise
}

function subscribe(id: number, listener: Listener): () => void {
  let set = listeners.get(id)
  if (!set) {
    set = new Set()
    listeners.set(id, set)
  }
  set.add(listener)
  void hydrate()
  return () => {
    set!.delete(listener)
    if (set!.size === 0) listeners.delete(id)
  }
}

function getSnapshot(id: number): OfflineState {
  return states.get(id) ?? ABSENT
}

export function useOfflineState(id: number): OfflineState {
  return useSyncExternalStore(
    cb => subscribe(id, cb),
    () => getSnapshot(id),
    () => getSnapshot(id),
  )
}

export function useOfflineHydrated(): boolean {
  const [ready, setReady] = useState(initialized)
  useEffect(() => {
    if (initialized) { setReady(true); return }
    void hydrate().then(() => setReady(true))
  }, [])
  return ready
}

export async function downloadVideo(id: number): Promise<void> {
  if (inflight.has(id)) return
  const ctrl = new AbortController()
  inflight.set(id, ctrl)
  setState(id, { status: 'downloading', progress: 0 })

  try {
    const res = await fetch(`/api/videos/${id}/stream`, { signal: ctrl.signal })
    if (!res.ok || !res.body) throw new Error(`Stream request failed: ${res.status}`)

    const total = Number(res.headers.get('Content-Length') ?? 0)
    const mimeType = res.headers.get('Content-Type') ?? 'video/mp4'

    const reader = res.body.getReader()
    const chunks: BlobPart[] = []
    let received = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(new Uint8Array(value).buffer)
      received += value.byteLength
      if (total > 0) {
        setState(id, { status: 'downloading', progress: received / total })
      } else {
        // Unknown size — still surface activity by oscillating between 0..0.99
        setState(id, { status: 'downloading', progress: Math.min(0.99, received / (received + 1_000_000)) })
      }
    }

    const blob = new Blob(chunks, { type: mimeType })
    await putOfflineVideo({ id, blob, mimeType, size: blob.size, downloadedAt: Date.now() })
    setState(id, { status: 'available', size: blob.size })
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      setState(id, { status: 'absent' })
    } else {
      console.error('[offline] download failed:', err)
      setState(id, { status: 'error', message: (err as Error).message })
    }
  } finally {
    inflight.delete(id)
  }
}

export function cancelDownload(id: number): void {
  inflight.get(id)?.abort()
}

export async function removeOfflineVideo(id: number): Promise<void> {
  cancelDownload(id)
  await deleteOfflineVideo(id)
  setState(id, { status: 'absent' })
}

export async function isAvailableOffline(id: number): Promise<boolean> {
  return hasOfflineVideo(id)
}
