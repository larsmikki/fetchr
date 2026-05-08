import { memo, useState } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { thumbnailUrl } from '@/api/client'
import type { Video, Collection } from '@/types'

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
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
  const [menuOpen, setMenuOpen] = useState(false)
  const [imgError, setImgError] = useState(false)

  const collection = video.collection_id != null ? collectionMap.get(video.collection_id) : undefined

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setMenuOpen(prev => !prev)
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    setMenuOpen(false)
    if (window.confirm('Delete this video?')) {
      onDelete(video)
    }
  }

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    setMenuOpen(false)
    onEdit(video)
  }

  return (
    <div
      className="card-hover cursor-pointer relative group"
      style={{
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      }}
      onClick={() => onClick(video)}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-black" style={{ background: theme.surface2, overflow: 'hidden', borderRadius: '12px 12px 0 0' }}>
        {video.fetch_status === 'pending' ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: `${theme.accent} transparent ${theme.accent} ${theme.accent}` }}
            />
          </div>
        ) : video.fetch_status === 'error' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
            <svg
              className="w-8 h-8"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              style={{ color: theme.text2 }}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
            <span className="text-xs" style={{ color: theme.text2 }}>
              Failed to load
            </span>
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
            <svg
              className="w-10 h-10"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1}
              style={{ color: theme.text2 }}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"
              />
            </svg>
          </div>
        )}

        {/* Play overlay on hover */}
        {video.fetch_status === 'ok' && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150"
            style={{ background: 'rgba(0,0,0,0.4)' }}
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(225,29,72,0.9)' }}
            >
              <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
              </svg>
            </div>
          </div>
        )}

        {/* Duration badge */}
        {video.duration !== null && (
          <div
            className="absolute bottom-1.5 right-1.5 text-xs px-1.5 py-0.5 rounded font-medium"
            style={{ background: 'rgba(0,0,0,0.75)', color: '#fff' }}
          >
            {formatDuration(video.duration)}
          </div>
        )}

        {/* Collection color dot (top-left) */}
        {showCollection && collection && (
          <div
            className="absolute top-1.5 left-1.5 w-2.5 h-2.5 rounded-full border border-white/30"
            style={{ background: collection.color }}
            title={collection.name}
          />
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p
              className="text-sm font-medium leading-snug line-clamp-2"
              style={{ color: theme.text }}
              title={video.title || undefined}
            >
              {video.title || (
                <span style={{ color: theme.text2 }}>Untitled</span>
              )}
            </p>

            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {video.site && (
                <span
                  className="text-xs px-1.5 py-0.5 rounded font-medium"
                  style={{ background: theme.surface2, color: theme.text2 }}
                >
                  {video.site}
                </span>
              )}
              {showCollection && collection && (
                <span
                  className="flex items-center gap-1 text-xs"
                  style={{ color: theme.text2 }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full inline-block"
                    style={{ background: collection.color }}
                  />
                  {collection.name}
                </span>
              )}
            </div>
          </div>

          {/* ... menu */}
          <div className="relative shrink-0">
            <button
              onClick={handleMenuClick}
              className="w-6 h-6 flex items-center justify-center rounded transition-colors"
              style={{ color: theme.text2 }}
              title="More options"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>

            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={e => { e.stopPropagation(); setMenuOpen(false) }}
                />
                <div
                  className="absolute right-0 top-7 z-20 py-1 rounded-lg shadow-lg min-w-32"
                  style={{
                    background: theme.surface,
                    border: `1px solid ${theme.border}`,
                  }}
                >
                  <button
                    onClick={handleEdit}
                    className="w-full text-left px-3 py-1.5 text-sm transition-colors hover:opacity-80"
                    style={{ color: theme.text }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={handleDelete}
                    className="w-full text-left px-3 py-1.5 text-sm transition-colors"
                    style={{ color: '#e11d48' }}
                  >
                    Delete
                  </button>
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
