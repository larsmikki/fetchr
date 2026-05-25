import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTheme } from '@/contexts/ThemeContext'
import { getVideos, deleteVideo, deleteCollection, updateCollection, createCollection } from '@/api/client'
import VideoCard from '@/components/VideoCard'
import EditVideoModal from '@/components/EditVideoModal'
import { usePlayer } from '@/contexts/PlayerContext'
import { Button, Input, Modal, Spinner, ColorSwatches, PRESET_COLORS } from '@/components/ui'
import type { Video, Collection } from '@/types'

interface CollectionPageProps {
  collections: Collection[]
  onAddVideo: (collectionId?: number) => void
  onCollectionsChange: () => void
  refreshKey: number
}

const PAGE_SIZE = 24

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

  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editColor, setEditColor] = useState('')
  const [saving, setSaving] = useState(false)

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
    } catch { /* ignore */ }
    finally { if (!silent) setLoading(false) }
  }, [collectionId])

  useEffect(() => {
    setPage(1)
    fetchVideos(1)
  }, [id, fetchVideos, refreshKey])

  useEffect(() => {
    const hasPending = videos.some(v => v.fetch_status === 'pending')
    if (!hasPending) return
    const timer = setInterval(() => fetchVideos(page, true), 4000)
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
    } catch { /* ignore */ }
    finally { setSaving(false) }
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
    } catch { /* ignore */ }
    finally { setCreating(false) }
  }

  const header = isUncategorized ? (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: theme.text }}>Uncategorized</h1>
      <p className="text-sm mt-0.5" style={{ color: theme.text2 }}>Videos not assigned to any collection</p>
    </div>
  ) : collection ? (
    editing ? (
      <form onSubmit={saveEdit} className="flex flex-col gap-3 max-w-md">
        <ColorSwatches value={editColor} onChange={setEditColor} />
        <Input type="text" value={editName} onChange={e => setEditName(e.target.value)} placeholder="Collection name" required className="font-bold" />
        <Input type="text" value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Description (optional)" />
        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" size="sm" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
        </div>
      </form>
    ) : (
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="w-4 h-4 rounded-full" style={{ background: collection.color }} />
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: theme.text }}>{collection.name}</h1>
          <Button variant="secondary" size="sm" onClick={startEdit}>Edit</Button>
          <Button variant="danger" size="sm" onClick={handleDeleteCollection}>Delete</Button>
        </div>
        {collection.description && (
          <p className="text-sm mt-1" style={{ color: theme.text2 }}>{collection.description}</p>
        )}
        <p className="text-sm mt-0.5" style={{ color: theme.text2 }}>{total} video{total !== 1 ? 's' : ''}</p>
      </div>
    )
  ) : (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: theme.text }}>Collection not found</h1>
    </div>
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        {header}
        <Button
          variant="primary"
          size="lg"
          onClick={() => onAddVideo(collection?.id)}
          leadingIcon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          }
        >
          Add Video
        </Button>
      </div>

      {loading ? (
        <Spinner />
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
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { setPage(p => Math.max(1, p - 1)); fetchVideos(Math.max(1, page - 1)) }}
            disabled={page === 1}
          >
            Previous
          </Button>
          <span className="text-sm" style={{ color: theme.text2 }}>Page {page} of {totalPages}</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { setPage(p => Math.min(totalPages, p + 1)); fetchVideos(Math.min(totalPages, page + 1)) }}
            disabled={page === totalPages}
          >
            Next
          </Button>
        </div>
      )}

      {editingVideo && (
        <EditVideoModal
          video={editingVideo}
          collections={collections}
          onCollectionsChange={onCollectionsChange}
          onClose={() => setEditingVideo(null)}
          onSaved={() => { setEditingVideo(null); fetchVideos(page); onCollectionsChange() }}
        />
      )}

      {showNewCollection && (
        <Modal title="New collection" onClose={() => setShowNewCollection(false)}>
          <form onSubmit={handleCreateCollection} className="px-6 py-5 flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5 tracking-wide" style={{ color: theme.text2 }}>Color</label>
              <ColorSwatches value={newColor} onChange={setNewColor} size={24} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 tracking-wide" style={{ color: theme.text2 }}>Name</label>
              <Input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Collection name" required />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 tracking-wide" style={{ color: theme.text2 }}>Description (optional)</label>
              <Input type="text" value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Short description..." />
            </div>
            <Button type="submit" variant="primary" fullWidth disabled={creating || !newName.trim()}>
              {creating ? 'Creating...' : 'Create Collection'}
            </Button>
          </form>
        </Modal>
      )}
    </div>
  )
}
