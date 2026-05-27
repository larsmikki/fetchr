import { useEffect, useState } from 'react'
import { usePlayer } from '@/contexts/PlayerContext'
import { useTheme } from '@/contexts/ThemeContext'
import { redownloadVideo } from '@/api'
import {
  downloadVideo,
  removeOfflineVideo,
  useOfflineState,
} from '@/offline/videoDownloads'
import type { Collection } from '@/types'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let n = bytes / 1024
  let i = 0
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(n < 10 ? 1 : 0)} ${units[i]}`
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function PersistentPlayer({ collections }: { collections: Collection[] }) {
  const { video, mode, videoRef, minimize, close, consumePendingSeek } = usePlayer()
  const { theme } = useTheme()
  const [userMaximized, setUserMaximized] = useState(false)
  const [redownloading, setRedownloading] = useState(false)
  const offline = useOfflineState(video?.id ?? -1)

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = 0.8
  }, [videoRef])

  // Escape minimizes (keeps audio playing) instead of closing
  useEffect(() => {
    if (mode !== 'full') return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') minimize() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [mode, minimize])

  if (!video || mode === 'closed') return null

  const streamUrl = `/api/videos/${video.id}/stream`
  const collection = collections.find(c => c.id === video.collection_id)
  const isFull = mode === 'full'
  const isMaximized = isFull && userMaximized

  const handleCanPlay = () => {
    const seek = consumePendingSeek()
    if (seek !== null && videoRef.current) {
      videoRef.current.currentTime = seek
    }
  }

  // The container changes CSS between modes — the <video> inside never remounts.
  // In mini mode the container is moved off-screen; audio continues, the bar in Layout takes over UI.
  const containerStyle: React.CSSProperties = isFull
    ? { position: 'fixed', top: 0, left: 0, right: isMaximized ? 0 : 288, bottom: 0, zIndex: 50, background: '#000' }
    : { position: 'fixed', left: -9999, width: 1, height: 1, overflow: 'hidden' }

  return (
    <>
      {/* Background overlay — click to minimize, keeps audio playing */}
      {isFull && (
        <div
          className="fixed inset-0"
          style={{ background: 'rgba(0,0,0,0.85)', zIndex: 49 }}
          onClick={minimize}
        />
      )}

      {/* Persistent video container — CSS-only transition between full and mini */}
      <div style={containerStyle}>
        {/* Video is always the first child so React never remounts it */}
        <video
          ref={videoRef}
          src={streamUrl}
          controls={isFull}
          autoPlay
          className="w-full h-full"
          style={{ objectFit: 'contain', display: 'block' }}
          onCanPlay={handleCanPlay}
        />

        {/* Full mode: title bar with minimize + close */}
        {isFull && (
          <div
            className="absolute top-0 inset-x-0 flex items-center justify-between px-3 py-2"
            style={{ background: 'rgba(0,0,0,0.65)' }}
            onClick={e => e.stopPropagation()}
          >
            <span className="text-white text-sm font-medium truncate pr-4">{video.title || 'Untitled'}</span>
            <div className="flex items-center gap-1 shrink-0">
              {/* Minimize to mini bar — arrows pointing inward */}
              <button
                onClick={minimize}
                title="Minimize — keeps playing"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-white/70 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />
                </svg>
              </button>
              {/* Maximize (hide panel) / Restore (show panel) */}
              <button
                onClick={() => setUserMaximized(p => !p)}
                title={isMaximized ? 'Show details panel' : 'Maximize — hide details'}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-white/70 hover:text-white transition-colors"
              >
                {isMaximized ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path strokeLinecap="round" d="M15 3v18" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                  </svg>
                )}
              </button>
              {/* Close */}
              <button
                onClick={close}
                title="Close"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-white/70 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

      </div>

      {/* Details sidebar — full mode only, hidden when maximized */}
      {isFull && !isMaximized && (
        <div
          className="fixed top-0 right-0 bottom-0 overflow-y-auto"
          style={{ width: 288, zIndex: 50, background: theme.surface, borderLeft: `1px solid ${theme.border}` }}
        >
          <div className="p-5 flex flex-col gap-4">
            <div>
              <p className="text-xs font-semibold tracking-wide mb-1" style={{ color: theme.text2 }}>Title</p>
              <p className="text-sm font-medium leading-snug" style={{ color: theme.text }}>
                {video.title || <span style={{ color: theme.text2 }}>Untitled</span>}
              </p>
            </div>

            {video.site && (
              <div>
                <p className="text-xs font-semibold tracking-wide mb-1" style={{ color: theme.text2 }}>Site</p>
                <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: theme.surface2, color: theme.text }}>
                  {video.site}
                </span>
              </div>
            )}

            {video.duration !== null && (
              <div>
                <p className="text-xs font-semibold tracking-wide mb-1" style={{ color: theme.text2 }}>Duration</p>
                <p className="text-sm font-medium" style={{ color: theme.text }}>{formatDuration(video.duration)}</p>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold tracking-wide mb-1" style={{ color: theme.text2 }}>Collection</p>
              {collection ? (
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: collection.color }} />
                  <span className="text-sm" style={{ color: theme.text }}>{collection.name}</span>
                </div>
              ) : (
                <span className="text-sm" style={{ color: theme.text2 }}>Uncategorized</span>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold tracking-wide mb-1" style={{ color: theme.text2 }}>Source</p>
              <div className="flex flex-col gap-2">
                {/* Active source pill — what's actually playing right now.
                    Priority: offline copy on this device → server file → live stream. */}
                {offline.status === 'available' ? (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium" style={{ background: '#1e40af', color: '#bfdbfe' }}>
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM10 2a1 1 0 011 1v8.586l2.293-2.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 11.586V3a1 1 0 011-1z" />
                      </svg>
                      Offline on device
                    </span>
                    <span className="text-xs" style={{ color: theme.text2 }}>{formatBytes(offline.size)}</span>
                  </div>
                ) : video.local_path ? (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium" style={{ background: '#166534', color: '#bbf7d0' }}>
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                      </svg>
                      Server file
                    </span>
                    <span className="text-xs font-mono break-all" style={{ color: theme.text2 }}>
                      {video.local_path.split(/[\\/]/).pop()}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium" style={{ background: theme.surface2, color: theme.text2 }}>
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                      </svg>
                      {redownloading ? 'Downloading to server…' : 'Live stream'}
                    </span>
                    {!redownloading && (
                      <button
                        onClick={async () => {
                          if (redownloading) return
                          setRedownloading(true)
                          try { await redownloadVideo(video.id) } catch { setRedownloading(false) }
                        }}
                        title="Pull this video to the server for faster playback"
                        className="text-xs underline transition-opacity hover:opacity-80"
                        style={{ color: theme.accent }}
                      >
                        Pull to server
                      </button>
                    )}
                  </div>
                )}

                {/* Offline-on-device row — always visible so the user can opt in/out. */}
                <div className="flex items-center gap-2">
                  {offline.status === 'downloading' ? (
                    <div className="flex items-center gap-2 w-full">
                      <span className="text-xs" style={{ color: theme.text2 }}>
                        Saving offline… {Math.round(offline.progress * 100)}%
                      </span>
                      <div className="flex-1 h-1 rounded" style={{ background: theme.surface2 }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${Math.round(offline.progress * 100)}%`,
                            background: theme.accent,
                            borderRadius: 4,
                            transition: 'width 0.25s linear',
                          }}
                        />
                      </div>
                    </div>
                  ) : offline.status === 'available' ? (
                    <button
                      onClick={() => {
                        if (window.confirm('Remove this video from offline storage?')) {
                          void removeOfflineVideo(video.id)
                        }
                      }}
                      className="text-xs underline transition-opacity hover:opacity-80"
                      style={{ color: theme.accent }}
                    >
                      Remove offline copy
                    </button>
                  ) : (
                    <button
                      onClick={() => void downloadVideo(video.id)}
                      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium transition-opacity hover:opacity-80"
                      style={{ background: theme.accent, color: '#fff' }}
                      title="Download to this device for offline playback"
                    >
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 2a1 1 0 011 1v8.586l2.293-2.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 11.586V3a1 1 0 011-1zM3 16a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" />
                      </svg>
                      {offline.status === 'error' ? 'Retry save offline' : 'Save for offline'}
                    </button>
                  )}
                </div>
                {offline.status === 'error' && (
                  <p className="text-xs" style={{ color: '#ef4444' }}>{offline.message}</p>
                )}
              </div>
            </div>

            {video.notes && (
              <div>
                <p className="text-xs font-semibold tracking-wide mb-1" style={{ color: theme.text2 }}>Notes</p>
                <p className="text-sm leading-relaxed" style={{ color: theme.text }}>{video.notes}</p>
              </div>
            )}

            <div style={{ borderTop: `1px solid ${theme.border}` }} />

            <div>
              <p className="text-xs font-semibold tracking-wide mb-1.5" style={{ color: theme.text2 }}>Original Page</p>
              <a
                href={video.page_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-80"
                style={{ color: theme.accent }}
              >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                Open original
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
