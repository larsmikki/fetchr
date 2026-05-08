import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTheme } from '@/contexts/ThemeContext'
import { getVideos, deleteVideo, deleteCollection, updateCollection, createCollection, updateVideo } from '@/api/client'
import { useDownloadPath } from '@/hooks/useDownloadPath'
import VideoCard from '@/components/VideoCard'
import { usePlayer } from '@/contexts/PlayerContext'
import type { Video, Collection } from '@/types'

interface CollectionPageProps {
  collections: Collection[]
  onAddVideo: (collectionId?: number) => void
  onCollectionsChange: () => void
  refreshKey: number
}

const PAGE_SIZE = 24

const PRESET_COLORS = [
  '#e11d48', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  '#14b8a6', '#64748b',
]

export default function CollectionPage({
  collections,
  onAddVideo,
  onCollectionsChange,
  refreshKey,
}: CollectionPageProps) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme } = useTheme()

  const isUncategorized = id === 'uncategorized'
  const collectionId = isUncategorized ? 'uncategorized' : Number(id)
  const collection = isUncategorized ? null : collections.find(c => c.id === Number(id))

  const [videos, setVideos] = useState<Video[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const { play } = usePlayer()
  const [editingVideo, setEditingVideo] = useState<Video | null>(null)

  // Edit collection state
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editColor, setEditColor] = useState('')
  const [saving, setSaving] = useState(false)

  // New collection modal
  const [showNewCollection, setShowNewCollection] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newColor, setNewColor] = useState(PRESET_COLORS[0])
  const [creating, setCreating] = useState(false)

  const fetchVideos = useCallback(async (p: number, silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await getVideos({ collection_id: collectionId, page: p, limit: PAGE_SIZE })
      setVideos(res.items)
      setTotal(res.total)
      setTotalPages(res.totalPages)
    } catch {
      // ignore
    } finally {
      if (!silent) setLoading(false)
    }
  }, [collectionId])

  useEffect(() => {
    setPage(1)
    fetchVideos(1)
  }, [id, fetchVideos, refreshKey])

  // Poll while any video on this page is still pending
  useEffect(() => {
    const hasPending = videos.some(v => v.fetch_status === 'pending')
    if (!hasPending) return
    const timer = setInterval(() => fetchVideos(page, true), 3000)
    return () => clearInterval(timer)
  }, [videos, page, fetchVideos])

  const collectionMap = useMemo(() => new Map(collections.map(c => [c.id, c])), [collections])

  const pageRef = useRef(page)
  pageRef.current = page

  const handleDelete = useCallback(async (video: Video) => {
    await deleteVideo(video.id)
    fetchVideos(pageRef.current)
    onCollectionsChange()
  }, [fetchVideos, onCollectionsChange])

  const handleEditVideo = useCallback((video: Video) => setEditingVideo(video), [])

  const handleDeleteCollection = async () => {
    if (!collection) return
    if (!window.confirm(`Delete collection "${collection.name}"? Videos will become uncategorized.`)) return
    await deleteCollection(collection.id)
    onCollectionsChange()
    navigate('/')
  }

  const startEdit = () => {
    if (!collection) return
    setEditName(collection.name)
    setEditDesc(collection.description ?? '')
    setEditColor(collection.color)
    setEditing(true)
  }

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!collection) return
    setSaving(true)
    try {
      await updateCollection(collection.id, {
        name: editName,
        description: editDesc || null,
        color: editColor,
      })
      onCollectionsChange()
      setEditing(false)
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    try {
      await createCollection({ name: newName.trim(), description: newDesc || undefined, color: newColor })
      onCollectionsChange()
      setShowNewCollection(false)
      setNewName('')
      setNewDesc('')
      setNewColor(PRESET_COLORS[0])
    } catch {
      // ignore
    } finally {
      setCreating(false)
    }
  }

  const header = isUncategorized ? (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: theme.text }}>
        Uncategorized
      </h1>
      <p className="text-sm mt-0.5" style={{ color: theme.text2 }}>
        Videos not assigned to any collection
      </p>
    </div>
  ) : collection ? (
    editing ? (
      <form onSubmit={saveEdit} className="flex flex-col gap-3 max-w-md">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5 flex-wrap">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setEditColor(c)}
                className="w-5 h-5 rounded-full transition-transform hover:scale-110"
                style={{
                  background: c,
                  outline: editColor === c ? `2px solid ${theme.text}` : 'none',
                  outlineOffset: 2,
                }}
              />
            ))}
          </div>
        </div>
        <input
          type="text"
          value={editName}
          onChange={e => setEditName(e.target.value)}
          placeholder="Collection name"
          className="px-3 py-2 rounded-lg text-sm outline-none font-bold"
          style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.text }}
          required
        />
        <input
          type="text"
          value={editDesc}
          onChange={e => setEditDesc(e.target.value)}
          placeholder="Description (optional)"
          className="px-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.text }}
        />
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #e11d48 0%, #9f1239 100%)' }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium"
            style={{ background: theme.surface2, color: theme.text }}
          >
            Cancel
          </button>
        </div>
      </form>
    ) : (
      <div>
        <div className="flex items-center gap-3">
          <span className="w-4 h-4 rounded-full" style={{ background: collection.color }} />
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: theme.text }}>
            {collection.name}
          </h1>
          <button
            onClick={startEdit}
            className="text-xs px-2 py-1 rounded-lg font-medium transition-opacity hover:opacity-80"
            style={{ background: theme.surface2, color: theme.text2 }}
          >
            Edit
          </button>
          <button
            onClick={handleDeleteCollection}
            className="text-xs px-2 py-1 rounded-lg font-medium transition-opacity hover:opacity-80"
            style={{ background: theme.surface2, color: '#e11d48' }}
          >
            Delete
          </button>
        </div>
        {collection.description && (
          <p className="text-sm mt-0.5" style={{ color: theme.text2 }}>
            {collection.description}
          </p>
        )}
        <p className="text-sm mt-0.5" style={{ color: theme.text2 }}>
          {total} video{total !== 1 ? 's' : ''}
        </p>
      </div>
    )
  ) : (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: theme.text }}>
        Collection not found
      </h1>
    </div>
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        {header}
        <button
          onClick={() => onAddVideo(collection?.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white shrink-0"
          style={{ background: 'linear-gradient(135deg, #e11d48 0%, #9f1239 100%)' }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Video
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div
            className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: `${theme.accent} transparent ${theme.accent} ${theme.accent}` }}
          />
        </div>
      ) : videos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: theme.surface2 }}>
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1} style={{ color: theme.text2 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <div className="text-center">
            <p className="font-semibold" style={{ color: theme.text }}>No videos here</p>
            <p className="text-xs mt-1" style={{ color: theme.text2 }}>Add a video to this collection to get started.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
          {videos.map(video => (
            <VideoCard
              key={video.id}
              video={video}
              collectionMap={collectionMap}
              onClick={play}
              onDelete={handleDelete}
              onEdit={handleEditVideo}
              showCollection={isUncategorized}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-2">
          <button
            onClick={() => { setPage(p => Math.max(1, p - 1)); fetchVideos(Math.max(1, page - 1)) }}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-40"
            style={{ background: theme.surface, border: `1px solid ${theme.border}`, color: theme.text }}
          >
            Previous
          </button>
          <span className="text-sm" style={{ color: theme.text2 }}>Page {page} of {totalPages}</span>
          <button
            onClick={() => { setPage(p => Math.min(totalPages, p + 1)); fetchVideos(Math.min(totalPages, page + 1)) }}
            disabled={page === totalPages}
            className="px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-40"
            style={{ background: theme.surface, border: `1px solid ${theme.border}`, color: theme.text }}
          >
            Next
          </button>
        </div>
      )}

      {editingVideo && (
        <EditVideoModal
          video={editingVideo}
          collections={collections}
          onCollectionsChange={onCollectionsChange}
          onClose={() => setEditingVideo(null)}
          onSaved={() => {
            setEditingVideo(null)
            fetchVideos(page)
            onCollectionsChange()
          }}
        />
      )}

      {showNewCollection && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowNewCollection(false) }}
        >
          <div className="w-full max-w-md rounded-2xl shadow-2xl" style={{ background: theme.surface, border: `1px solid ${theme.border}` }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${theme.border}` }}>
              <h2 className="text-base font-bold" style={{ color: theme.text }}>New collection</h2>
              <button onClick={() => setShowNewCollection(false)} className="w-8 h-8 flex items-center justify-center rounded-lg" style={{ color: theme.text2 }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleCreateCollection} className="px-6 py-5 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5 tracking-wide" style={{ color: theme.text2 }}>Color</label>
                <div className="flex gap-2 flex-wrap">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewColor(c)}
                      className="w-6 h-6 rounded-full transition-transform hover:scale-110"
                      style={{ background: c, outline: newColor === c ? `2px solid ${theme.text}` : 'none', outlineOffset: 2 }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 tracking-wide" style={{ color: theme.text2 }}>Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Collection name"
                  required
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.text }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 tracking-wide" style={{ color: theme.text2 }}>Description (optional)</label>
                <input
                  type="text"
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  placeholder="Short description..."
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.text }}
                />
              </div>
              <button
                type="submit"
                disabled={creating || !newName.trim()}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #e11d48 0%, #9f1239 100%)' }}
              >
                {creating ? 'Creating...' : 'Create Collection'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

const PRESET_COLORS_EDIT = [
  '#e11d48', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  '#14b8a6', '#64748b',
]

function EditVideoModal({
  video,
  collections,
  onCollectionsChange,
  onClose,
  onSaved,
}: {
  video: Video
  collections: Collection[]
  onCollectionsChange: () => void
  onClose: () => void
  onSaved: () => void
}) {
  const { theme } = useTheme()
  const outputDir = useDownloadPath()
  const mouseDownOnBackdrop = useRef(false)
  const [url, setUrl] = useState(video.page_url)
  const [collectionId, setCollectionId] = useState<number | ''>(video.collection_id ?? '')
  const [outputMp3, setOutputMp3] = useState(false)
  const [outputMp4, setOutputMp4] = useState(false)
  const [loading, setLoading] = useState(false)

  const [showNewColl, setShowNewColl] = useState(false)
  const [newCollName, setNewCollName] = useState('')
  const [newCollColor, setNewCollColor] = useState(PRESET_COLORS_EDIT[0])
  const [creatingColl, setCreatingColl] = useState(false)
  const [extraCollections, setExtraCollections] = useState<Collection[]>([])
  const allCollections = useMemo(() => [
    ...collections,
    ...extraCollections.filter(ec => !collections.some(c => c.id === ec.id)),
  ], [collections, extraCollections])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const urlChanged = url.trim() !== video.page_url
      let redownload = false
      if (urlChanged) {
        redownload = window.confirm('URL has changed. Re-download the video from the new URL? This will overwrite all metadata and the local file.')
      }
      await updateVideo(video.id, {
        page_url: urlChanged ? url.trim() : undefined,
        redownload,
        collection_id: collectionId !== '' ? Number(collectionId) : null,
        download_mp3: outputMp3,
        output_mp4: outputMp4,
      })
      onSaved()
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCollName.trim()) return
    setCreatingColl(true)
    try {
      const col = await createCollection({ name: newCollName.trim(), color: newCollColor })
      setExtraCollections(prev => [...prev, col])
      setCollectionId(col.id)
      setShowNewColl(false)
      setNewCollName('')
      setNewCollColor(PRESET_COLORS_EDIT[0])
      onCollectionsChange()
    } catch {
      // ignore
    } finally {
      setCreatingColl(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onMouseDown={e => { mouseDownOnBackdrop.current = e.target === e.currentTarget }}
      onClick={e => { if (mouseDownOnBackdrop.current && e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md rounded-2xl shadow-2xl" style={{ background: theme.surface, border: `1px solid ${theme.border}` }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${theme.border}` }}>
          <h2 className="text-base font-bold" style={{ color: theme.text }}>Edit video</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg" style={{ color: theme.text2 }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSave} className="px-6 py-5 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold mb-1.5 tracking-wide" style={{ color: theme.text2 }}>URL</label>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              required
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none font-mono"
              style={{ background: theme.surface2, border: `1px solid ${url.trim() !== video.page_url ? theme.accent : theme.border}`, color: theme.text }}
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold tracking-wide" style={{ color: theme.text2 }}>Collection</label>
              <button
                type="button"
                onClick={() => setShowNewColl(v => !v)}
                className="text-xs font-medium transition-opacity hover:opacity-80"
                style={{ color: theme.accent }}
              >
                {showNewColl ? 'Cancel' : '+ New collection'}
              </button>
            </div>
            <select
              value={collectionId}
              onChange={e => setCollectionId(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
              style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.text }}
            >
              <option value="">No collection</option>
              {allCollections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            {showNewColl && (
              <div
                className="mt-2 p-3 rounded-xl flex flex-col gap-2"
                style={{ background: theme.surface2, border: `1px solid ${theme.border}` }}
              >
                <div className="flex gap-1.5 flex-wrap">
                  {PRESET_COLORS_EDIT.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewCollColor(c)}
                      className="w-5 h-5 rounded-full transition-transform hover:scale-110"
                      style={{ background: c, outline: newCollColor === c ? `2px solid ${theme.text}` : 'none', outlineOffset: 2 }}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCollName}
                    onChange={e => setNewCollName(e.target.value)}
                    placeholder="Collection name"
                    className="flex-1 px-2.5 py-1.5 rounded-lg text-sm outline-none"
                    style={{ background: theme.surface, border: `1px solid ${theme.border}`, color: theme.text }}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleCreateCollection}
                    disabled={creatingColl || !newCollName.trim()}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #e11d48 0%, #9f1239 100%)' }}
                  >
                    {creatingColl ? '...' : 'Create'}
                  </button>
                </div>
              </div>
            )}
          </div>
          {outputDir && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold tracking-wide" style={{ color: theme.text2 }}>Output folder</span>
                <span className="text-xs font-mono truncate max-w-48" style={{ color: theme.text2 }} title={outputDir}>{outputDir}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2.5 p-3 rounded-xl cursor-pointer transition-all border"
                  style={{ background: outputMp3 ? theme.surface2 : theme.surface, borderColor: outputMp3 ? theme.accent : theme.border, color: theme.text }}>
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 transition-colors"
                    style={{ background: outputMp3 ? theme.accent : theme.surface2, color: outputMp3 ? 'white' : theme.text2 }}>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path fillRule="evenodd" clipRule="evenodd" d="M10 1C9.73478 1 9.48043 1.10536 9.29289 1.29289L3.29289 7.29289C3.10536 7.48043 3 7.73478 3 8V20C3 21.6569 4.34315 23 6 23H7C7.55228 23 8 22.5523 8 22C8 21.4477 7.55228 21 7 21H6C5.44772 21 5 20.5523 5 20V9H10C10.5523 9 11 8.55228 11 8V3H18C18.5523 3 19 3.44772 19 4V7C19 7.55228 19.4477 8 20 8C20.5523 8 21 7.55228 21 7V4C21 2.34315 19.6569 1 18 1H10ZM9 7H6.41421L9 4.41421V7ZM12.5 24C13.8807 24 15 22.8807 15 21.5V12.8673L20 12.153V18.05C19.8384 18.0172 19.6712 18 19.5 18C18.1193 18 17 19.1193 17 20.5C17 21.8807 18.1193 23 19.5 23C20.8807 23 22 21.8807 22 20.5V11C22 10.7101 21.8742 10.4345 21.6552 10.2445C21.4362 10.0546 21.1456 9.96905 20.8586 10.0101L13.8586 11.0101C13.3659 11.0804 13 11.5023 13 12V19.05C12.8384 19.0172 12.6712 19 12.5 19C11.1193 19 10 20.1193 10 21.5C10 22.8807 11.1193 24 12.5 24Z" />
                    </svg>
                  </div>
                  <span className="text-sm font-semibold leading-tight">Output Audio</span>
                  <input type="checkbox" className="hidden" checked={outputMp3} onChange={e => setOutputMp3(e.target.checked)} />
                </label>
                <label className="flex items-center gap-2.5 p-3 rounded-xl cursor-pointer transition-all border"
                  style={{ background: outputMp4 ? theme.surface2 : theme.surface, borderColor: outputMp4 ? theme.accent : theme.border, color: theme.text }}>
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 transition-colors"
                    style={{ background: outputMp4 ? theme.accent : theme.surface2, color: outputMp4 ? 'white' : theme.text2 }}>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M19.5617 7C19.7904 5.69523 18.7863 4.5 17.4617 4.5H6.53788C5.21323 4.5 4.20922 5.69523 4.43784 7" />
                      <path d="M17.4999 4.5C17.5283 4.24092 17.5425 4.11135 17.5427 4.00435C17.545 2.98072 16.7739 2.12064 15.7561 2.01142C15.6497 2 15.5194 2 15.2588 2H8.74099C8.48035 2 8.35002 2 8.24362 2.01142C7.22584 2.12064 6.45481 2.98072 6.45704 4.00434C6.45727 4.11135 6.47146 4.2409 6.49983 4.5" />
                      <path d="M14.5812 13.6159C15.1396 13.9621 15.1396 14.8582 14.5812 15.2044L11.2096 17.2945C10.6669 17.6309 10 17.1931 10 16.5003L10 12.32C10 11.6273 10.6669 11.1894 11.2096 11.5258L14.5812 13.6159Z" />
                      <path d="M2.38351 13.793C1.93748 10.6294 1.71447 9.04765 2.66232 8.02383C3.61017 7 5.29758 7 8.67239 7H15.3276C18.7024 7 20.3898 7 21.3377 8.02383C22.2855 9.04765 22.0625 10.6294 21.6165 13.793L21.1935 16.793C20.8437 19.2739 20.6689 20.5143 19.7717 21.2572C18.8745 22 17.5512 22 14.9046 22H9.09536C6.44881 22 5.12553 22 4.22834 21.2572C3.33115 20.5143 3.15626 19.2739 2.80648 16.793L2.38351 13.793Z" />
                    </svg>
                  </div>
                  <span className="text-sm font-semibold leading-tight">Output Video</span>
                  <input type="checkbox" className="hidden" checked={outputMp4} onChange={e => setOutputMp4(e.target.checked)} />
                </label>
              </div>
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #e11d48 0%, #9f1239 100%)' }}
          >
            {loading ? 'Saving...' : 'Save'}
          </button>
        </form>
      </div>
    </div>
  )
}
