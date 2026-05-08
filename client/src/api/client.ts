import type { Collection, Video, PaginatedResponse, CollectionsResponse } from '@/types'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let message = `API error ${res.status}`
    try { const j = JSON.parse(text); if (j?.error) message = j.error } catch {}
    throw new Error(message)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

// Active desktop — module-level so all API calls pick it up automatically
let _desktop: 1 | 2 = (() => {
  try { return localStorage.getItem('reely_desktop') === '2' ? 2 : 1 } catch { return 1 }
})()

export function getActiveDesktop(): 1 | 2 { return _desktop }

export function setActiveDesktop(d: 1 | 2) {
  _desktop = d
  try { localStorage.setItem('reely_desktop', String(d)) } catch {}
}

// Collections
export function getCollections(): Promise<CollectionsResponse> {
  return request(`/api/collections?desktop=${_desktop}`)
}

export function createCollection(data: {
  name: string
  description?: string
  color?: string
}): Promise<Collection> {
  return request('/api/collections', {
    method: 'POST',
    body: JSON.stringify({ ...data, desktop_id: _desktop }),
  })
}

export function updateCollection(
  id: number,
  data: Partial<Collection>
): Promise<Collection> {
  return request(`/api/collections/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function deleteCollection(id: number): Promise<void> {
  return request(`/api/collections/${id}`, { method: 'DELETE' })
}

// Videos
export function getVideos(params: {
  collection_id?: number | 'uncategorized'
  page?: number
  limit?: number
  q?: string
}): Promise<PaginatedResponse<Video>> {
  const searchParams = new URLSearchParams()
  searchParams.set('desktop', String(_desktop))
  if (params.collection_id !== undefined)
    searchParams.set('collection_id', String(params.collection_id))
  if (params.page !== undefined) searchParams.set('page', String(params.page))
  if (params.limit !== undefined) searchParams.set('limit', String(params.limit))
  if (params.q) searchParams.set('q', params.q)
  return request(`/api/videos?${searchParams.toString()}`)
}

export function addVideo(data: {
  url: string
  collection_id?: number
  notes?: string
  download_mp3?: boolean
  output_mp4?: boolean
}): Promise<Video> {
  return request('/api/videos', {
    method: 'POST',
    body: JSON.stringify({ ...data, desktop_id: _desktop }),
  })
}

export function updateVideo(id: number, data: Partial<Video> & { download_mp3?: boolean; output_mp4?: boolean; redownload?: boolean }): Promise<Video> {
  return request(`/api/videos/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function deleteVideo(id: number): Promise<void> {
  return request(`/api/videos/${id}`, { method: 'DELETE' })
}

export function getVideoById(id: number): Promise<Video> {
  return request(`/api/videos/${id}`)
}

export function refreshVideo(id: number): Promise<Video> {
  return request(`/api/videos/${id}/refresh`, { method: 'POST' })
}

export function redownloadVideo(id: number): Promise<{ ok: boolean }> {
  return request(`/api/videos/${id}/redownload`, { method: 'POST' })
}

export function thumbnailUrl(id: number): string {
  return `/api/videos/${id}/thumbnail`
}

// Data export / import
export function exportData(): void {
  const a = document.createElement('a')
  a.href = '/api/data/export'
  a.download = 'reely-backup.json'
  a.click()
}

export function downloadAllVideos(): void {
  const a = document.createElement('a')
  a.href = '/api/data/videos.zip'
  a.download = 'reely-videos.zip'
  a.click()
}

export async function importData(file: File): Promise<{ imported: number }> {
  const text = await file.text()
  const data = JSON.parse(text)
  return request('/api/data/import', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

// Settings
export function getSettings(): Promise<Record<string, string>> {
  return request('/api/settings')
}

export function updateSettings(data: Record<string, string>): Promise<void> {
  return request('/api/settings', {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}
