import { memo, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTheme } from '@/contexts/ThemeContext'
import { thumbnailUrl, cleanupAndRetryVideo } from '@/api'
import { useActiveVideoJob, JOB_KIND_LABEL } from '@/contexts/JobsContext'
import { usePlayer } from '@/contexts/PlayerContext'
import {
  downloadVideo,
  removeOfflineVideo,
  useOfflineState,
} from '@/offline/videoDownloads'
import type { Video, Collection } from '@/types'

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

interface VideoCardProps {
  video: Video
  onClick: (video: Video) => void
  onDelete: (video: Video) => void
  onEdit: (video: Video) => void
  collectionMap: Map<number, Collection>
  showCollection?: boolean
}

const VideoCard = memo(function VideoCard({
  video,
  onClick,
  onDelete,
  onEdit,
  collectionMap,
  showCollection = true,
}: VideoCardProps) {
  const { theme } = useTheme()
  const queryClient = useQueryClient()
  const [menuOpen, setMenuOpen] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [copied, setCopied] = useState(false)
  const activeJob = useActiveVideoJob(video.id)
  const { musicMode, video: playingVideo, videoRef } = usePlayer()

  const isActiveMusic = musicMode && playingVideo?.id === video.id
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (!isActiveMusic) return
    const el = videoRef.current
    if (!el) return
    setPaused(el.paused)
    const onPlay = () => setPaused(false)
    const onPause = () => setPaused(true)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    return () => {
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
    }
  }, [isActiveMusic, videoRef])

  const collection = video.collection_id != null ? collectionMap.get(video.collection_id) : undefined
  const isPending = video.fetch_status === 'pending' || !!activeJob

  const handleMenuClick = (e: React.MouseEvent) => { e.stopPropagation(); setMenuOpen(p => !p) }
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation(); setMenuOpen(false)
    if (window.confirm('Delete this video?')) onDelete(video)
  }
  const handleEdit = (e: React.MouseEvent) => { e.stopPropagation(); setMenuOpen(false); onEdit(video) }
  const handleRetry = async (e: React.MouseEvent) => {
    e.stopPropagation(); setMenuOpen(false)
    setRetrying(true)
    try {
      await cleanupAndRetryVideo(video.id)
      await queryClient.invalidateQueries({ queryKey: ['videos'] })
    } catch { /* surfaced again as fetch_error on the next refetch */ }
    finally { setRetrying(false) }
  }
  const handleCopyError = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!video.fetch_error) return
    try {
      await navigator.clipboard.writeText(video.fetch_error)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable */ }
  }

  const offline = useOfflineState(video.id)
  const handleOfflineToggle = (e: React.MouseEvent) => {
    e.stopPropagation(); setMenuOpen(false)
    if (offline.status === 'available') {
      if (window.confirm('Remove this video from offline storage?')) {
        void removeOfflineVideo(video.id)
      }
    } else if (offline.status === 'absent' || offline.status === 'error') {
      void downloadVideo(video.id)
    }
  }
  const offlineLabel =
    offline.status === 'available' ? 'Remove offline copy'
    : offline.status === 'downloading' ? `Downloading… ${Math.round(offline.progress * 100)}%`
    : offline.status === 'error' ? 'Retry offline download'
    : 'Save for offline'

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (!isActiveMusic) return
    e.stopPropagation()
    const el = videoRef.current
    if (!el) return
    if (el.paused) el.play().catch(() => {}); else el.pause()
  }

  const showPauseIcon = isActiveMusic && !paused

  return (
    <div
      className="card-hover cursor-pointer relative group"
      style={{
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        // While the menu is open, lift this card above its grid siblings so the
        // dropdown isn't painted behind later cards (the hover transform on
        // .card-hover creates a stacking context that would otherwise trap it).
        zIndex: menuOpen ? 30 : undefined,
      }}
      onClick={() => onClick(video)}
    >
      <div className="relative aspect-video bg-black" style={{ background: theme.surface2, overflow: 'hidden', borderRadius: '12px 12px 0 0' }}>
        {isPending ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4">
            <div
              className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: `${theme.accent} transparent ${theme.accent} ${theme.accent}` }}
            />
            {activeJob && (
              <span className="text-xs text-center" style={{ color: theme.text2 }}>
                {JOB_KIND_LABEL[activeJob.kind]}
              </span>
            )}
          </div>
        ) : video.fetch_status === 'error' ? (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-3 text-center"
            onClick={e => e.stopPropagation()}
          >
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ color: '#e11d48' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <span className="text-xs font-semibold" style={{ color: theme.text }}>Failed to load</span>
            {video.fetch_error && (
              <span
                className="text-[11px] leading-tight line-clamp-3 break-words select-text"
                style={{ color: theme.text2 }}
                title={video.fetch_error}
              >
                {video.fetch_error}
              </span>
            )}
            <div className="flex items-center gap-1.5 mt-0.5">
              <button
                onClick={handleRetry}
                disabled={retrying}
                className="text-xs font-medium px-2.5 py-1 rounded transition-opacity hover:opacity-80 disabled:opacity-60"
                style={{ background: theme.accent, color: '#fff' }}
              >
                {retrying ? 'Retrying…' : 'Retry'}
              </button>
              {video.fetch_error && (
                <button
                  onClick={handleCopyError}
                  className="text-xs font-medium px-2.5 py-1 rounded transition-opacity hover:opacity-80"
                  style={{ background: theme.surface2, color: theme.text2 }}
                >
                  {copied ? 'Copied' : 'Copy error'}
                </button>
              )}
            </div>
          </div>
        ) : !imgError ? (
          <img
            src={thumbnailUrl(video.id)}
            alt={video.title || 'Video thumbnail'}
            loading="lazy"
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1} style={{ color: theme.text2 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
        )}

        {/* Progress bar for active jobs */}
        {activeJob && activeJob.progress > 0 && (
          <div
            className="absolute bottom-0 left-0 right-0"
            style={{ height: 3, background: 'rgba(0,0,0,0.35)' }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.round(activeJob.progress * 100)}%`,
                background: theme.accent,
                transition: 'width 0.25s linear',
              }}
            />
          </div>
        )}

        {video.fetch_status === 'ok' && !isPending && (
          <div
            className={`absolute inset-0 flex items-center justify-center transition-opacity duration-150 ${isActiveMusic ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
            style={{ background: isActiveMusic ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.4)' }}
            onClick={handleOverlayClick}
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(225,29,72,0.9)' }}
              title={isActiveMusic ? (showPauseIcon ? 'Pause' : 'Play') : undefined}
              aria-label={isActiveMusic ? (showPauseIcon ? 'Pause' : 'Play') : undefined}
            >
              {showPauseIcon ? (
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                </svg>
              )}
            </div>
          </div>
        )}

        {video.duration !== null && (
          <div className="absolute bottom-1.5 right-1.5 text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(0,0,0,0.75)', color: '#fff' }}>
            {formatDuration(video.duration)}
          </div>
        )}

        {showCollection && collection && (
          <div className="absolute top-1.5 left-1.5 w-2.5 h-2.5 rounded-full border border-white/30" style={{ background: collection.color }} title={collection.name} />
        )}

        {offline.status === 'available' && (
          <div
            className="absolute top-1.5 right-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium"
            style={{ background: 'rgba(0,0,0,0.65)', color: '#fff' }}
            title="Available offline"
          >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
              <path d="M10 2a1 1 0 011 1v8.586l2.293-2.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 11.586V3a1 1 0 011-1zM3 16a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" />
            </svg>
            <span>Offline</span>
          </div>
        )}
        {offline.status === 'downloading' && (
          <div
            className="absolute top-0 left-0 right-0"
            style={{ height: 3, background: 'rgba(0,0,0,0.35)' }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.round(offline.progress * 100)}%`,
                background: '#22c55e',
                transition: 'width 0.25s linear',
              }}
            />
          </div>
        )}
      </div>

      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p
              className="text-sm font-medium leading-snug line-clamp-2"
              style={{ color: theme.text }}
              title={video.title || undefined}
            >
              {video.title || <span style={{ color: theme.text2 }}>Untitled</span>}
            </p>

            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {video.site && (
                <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: theme.surface2, color: theme.text2 }}>
                  {video.site}
                </span>
              )}
              {showCollection && collection && (
                <span className="flex items-center gap-1 text-xs" style={{ color: theme.text2 }}>
                  <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: collection.color }} />
                  {collection.name}
                </span>
              )}
            </div>
          </div>

          <div className="relative shrink-0">
            <button onClick={handleMenuClick} className="w-6 h-6 flex items-center justify-center rounded transition-colors" style={{ color: theme.text2 }} title="More options">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={e => { e.stopPropagation(); setMenuOpen(false) }} />
                <div className="absolute right-0 top-7 z-20 py-1 rounded-lg shadow-lg min-w-32" style={{ background: theme.surface, border: `1px solid ${theme.border}` }}>
                  {video.fetch_status === 'error' && (
                    <button
                      onClick={handleRetry}
                      disabled={retrying}
                      className="w-full text-left px-3 py-1.5 text-sm transition-colors hover:opacity-80 disabled:opacity-60"
                      style={{ color: theme.text }}
                    >
                      {retrying ? 'Retrying…' : 'Retry download'}
                    </button>
                  )}
                  <button onClick={handleEdit} className="w-full text-left px-3 py-1.5 text-sm transition-colors hover:opacity-80" style={{ color: theme.text }}>Edit</button>
                  <button
                    onClick={handleOfflineToggle}
                    disabled={offline.status === 'downloading'}
                    className="w-full text-left px-3 py-1.5 text-sm transition-colors hover:opacity-80 disabled:opacity-60"
                    style={{ color: theme.text }}
                  >
                    {offlineLabel}
                  </button>
                  <button onClick={handleDelete} className="w-full text-left px-3 py-1.5 text-sm transition-colors" style={{ color: '#e11d48' }}>Delete</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})

export default VideoCard
