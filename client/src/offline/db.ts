// Tiny IndexedDB wrapper for storing downloaded video blobs. Used from both
// the React app (writes) and the service worker (reads). The schema and
// version must stay in sync with sw.js.

export const DB_NAME = 'reely-offline'
export const DB_VERSION = 1
export const STORE_VIDEOS = 'videos'

export interface OfflineVideoRecord {
  id: number
  blob: Blob
  mimeType: string
  size: number
  downloadedAt: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_VIDEOS)) {
        db.createObjectStore(STORE_VIDEOS, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_VIDEOS, mode)
    const store = tx.objectStore(STORE_VIDEOS)
    const req = fn(store)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export async function putOfflineVideo(record: OfflineVideoRecord): Promise<void> {
  await withStore('readwrite', store => store.put(record))
}

export async function getOfflineVideo(id: number): Promise<OfflineVideoRecord | undefined> {
  return withStore<OfflineVideoRecord | undefined>('readonly', store => store.get(id))
}

export async function hasOfflineVideo(id: number): Promise<boolean> {
  const key = await withStore<IDBValidKey | undefined>('readonly', store => store.getKey(id))
  return key !== undefined
}

export async function deleteOfflineVideo(id: number): Promise<void> {
  await withStore('readwrite', store => store.delete(id))
}

export async function listOfflineVideoIds(): Promise<number[]> {
  const keys = await withStore<IDBValidKey[]>('readonly', store => store.getAllKeys())
  return keys.map(k => Number(k))
}
