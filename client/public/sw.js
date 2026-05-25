// Reely service worker.
// - Intercepts GET /api/videos/:id/stream and serves bytes from IndexedDB when
//   the user has downloaded the video for offline use. Honors HTTP Range so
//   the <video> element can still seek.
// - Stale-while-revalidate for /api/videos, /api/collections, and thumbnails
//   so the grid renders without the server.
// - Cache-first for built assets so the app shell launches offline.

const VERSION = 'reely-v1'
const STATIC_CACHE = `static-${VERSION}`
const API_CACHE = `api-${VERSION}`

const DB_NAME = 'reely-offline'
const DB_VERSION = 1
const STORE_VIDEOS = 'videos'

const APP_SHELL = ['/', '/index.html', '/manifest.json', '/favicon.svg', '/apple-touch-icon.png']

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(APP_SHELL)).catch(() => {}),
  )
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(
      keys.filter(k => k !== STATIC_CACHE && k !== API_CACHE).map(k => caches.delete(k)),
    )
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  const streamMatch = url.pathname.match(/^\/api\/videos\/(\d+)\/stream$/)
  if (streamMatch) {
    event.respondWith(handleVideoStream(Number(streamMatch[1]), req))
    return
  }

  if (url.pathname.startsWith('/api/videos/') && url.pathname.endsWith('/thumbnail')) {
    event.respondWith(staleWhileRevalidate(API_CACHE, req))
    return
  }
  if (url.pathname === '/api/videos' || url.pathname === '/api/collections') {
    event.respondWith(staleWhileRevalidate(API_CACHE, req))
    return
  }

  // Don't cache other API responses — they're stateful (jobs, settings, etc.).
  if (url.pathname.startsWith('/api/')) return

  // App shell + assets — cache first, falling back to network.
  event.respondWith(cacheFirst(STATIC_CACHE, req))
})

async function handleVideoStream(id, req) {
  try {
    const record = await idbGetVideo(id)
    if (record && record.blob) {
      return buildBlobResponse(record.blob, record.mimeType || 'video/mp4', req.headers.get('Range'))
    }
  } catch (err) {
    // fall through to network
  }
  return fetch(req)
}

function buildBlobResponse(blob, mimeType, rangeHeader) {
  const size = blob.size
  if (!rangeHeader) {
    return new Response(blob, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(size),
        'Accept-Ranges': 'bytes',
      },
    })
  }
  const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader)
  if (!match) {
    return new Response(blob, { status: 200, headers: { 'Content-Type': mimeType } })
  }
  const start = match[1] ? Number(match[1]) : 0
  const end = match[2] ? Number(match[2]) : size - 1
  if (start >= size || end >= size || start > end) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${size}` },
    })
  }
  const chunk = blob.slice(start, end + 1, mimeType)
  return new Response(chunk, {
    status: 206,
    headers: {
      'Content-Type': mimeType,
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
    },
  })
}

async function staleWhileRevalidate(cacheName, req) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(req)
  const fetchPromise = fetch(req).then(res => {
    if (res && res.ok) cache.put(req, res.clone()).catch(() => {})
    return res
  }).catch(() => cached)
  return cached || fetchPromise
}

async function cacheFirst(cacheName, req) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(req)
  if (cached) return cached
  try {
    const res = await fetch(req)
    if (res && res.ok) cache.put(req, res.clone()).catch(() => {})
    return res
  } catch (err) {
    // Last-resort fallback for navigations: serve cached index.
    if (req.mode === 'navigate') {
      const shell = await cache.match('/index.html')
      if (shell) return shell
    }
    throw err
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION)
    r.onupgradeneeded = () => {
      const db = r.result
      if (!db.objectStoreNames.contains(STORE_VIDEOS)) {
        db.createObjectStore(STORE_VIDEOS, { keyPath: 'id' })
      }
    }
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

async function idbGetVideo(id) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VIDEOS, 'readonly')
    const req = tx.objectStore(STORE_VIDEOS).get(id)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}
