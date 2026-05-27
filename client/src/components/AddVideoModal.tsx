import { useState, useEffect, useRef, useMemo } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { addVideo, createCollection } from '@/api'
import { useDownloadPath } from '@/hooks/useDownloadPath'
import { Button, Input, Select, Modal, ColorSwatches, PRESET_COLORS, OutputOptions } from '@/components/ui'
import type { Collection, Video } from '@/types'

interface AddVideoModalProps {
  collections: Collection[]
  onClose: () => void
  onAdded: (video: Video) => void
  onCollectionsChange: () => void
  defaultCollectionId?: number
}

export default function AddVideoModal({
  collections,
  onClose,
  onAdded,
  onCollectionsChange,
  defaultCollectionId,
}: AddVideoModalProps) {
  const outputDir = useDownloadPath()
  const { theme } = useTheme()
  const [url, setUrl] = useState('')
  const [collectionId, setCollectionId] = useState<number | ''>(defaultCollectionId ?? '')
  const [notes, setNotes] = useState('')
  const [outputMp3, setOutputMp3] = useState(false)
  const [outputMp4, setOutputMp4] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const urlRef = useRef<HTMLInputElement>(null)

  const [showNewColl, setShowNewColl] = useState(false)
  const [newCollName, setNewCollName] = useState('')
  const [newCollColor, setNewCollColor] = useState(PRESET_COLORS[0])
  const [creatingColl, setCreatingColl] = useState(false)
  const [extraCollections, setExtraCollections] = useState<Collection[]>([])
  const allCollections = useMemo(() => [
    ...collections,
    ...extraCollections.filter(ec => !collections.some(c => c.id === ec.id)),
  ], [collections, extraCollections])

  useEffect(() => { urlRef.current?.focus() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) { setError('Please enter a URL.'); return }
    setLoading(true); setError(null)
    try {
      const video = await addVideo({
        url: url.trim(),
        collection_id: collectionId !== '' ? Number(collectionId) : undefined,
        notes: notes.trim() || undefined,
        download_mp3: outputMp3,
        output_mp4: outputMp4,
      })
      onAdded(video)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add video.')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateCollection = async () => {
    if (!newCollName.trim()) return
    setCreatingColl(true)
    try {
      const col = await createCollection({ name: newCollName.trim(), color: newCollColor })
      setExtraCollections(prev => [...prev, col])
      setCollectionId(col.id)
      setShowNewColl(false)
      setNewCollName('')
      setNewCollColor(PRESET_COLORS[0])
      onCollectionsChange()
    } catch { /* ignore */ }
    finally { setCreatingColl(false) }
  }

  return (
    <Modal title="Add Video" onClose={onClose}>
      <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
        <div>
          <label className="block text-xs font-semibold mb-1.5 tracking-wide" style={{ color: theme.text2 }}>Video URL</label>
          <Input
            ref={urlRef}
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://..."
            disabled={loading}
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
          <Select
            value={collectionId}
            onChange={e => setCollectionId(e.target.value === '' ? '' : Number(e.target.value))}
            disabled={loading}
          >
            <option value="">No collection</option>
            {allCollections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>

          {showNewColl && (
            <div className="mt-2 p-3 rounded-xl flex flex-col gap-2" style={{ background: theme.surface2, border: `1px solid ${theme.border}` }}>
              <ColorSwatches value={newCollColor} onChange={setNewCollColor} />
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={newCollName}
                  onChange={e => setNewCollName(e.target.value)}
                  placeholder="Collection name"
                  className="!py-1.5"
                  autoFocus
                />
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleCreateCollection}
                  disabled={creatingColl || !newCollName.trim()}
                >
                  {creatingColl ? '...' : 'Create'}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1.5 tracking-wide" style={{ color: theme.text2 }}>Notes (optional)</label>
          <Input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Add a note..."
            disabled={loading}
          />
        </div>

        {outputDir && (
          <OutputOptions
            outputDir={outputDir}
            outputMp3={outputMp3}
            outputMp4={outputMp4}
            onMp3Change={setOutputMp3}
            onMp4Change={setOutputMp4}
          />
        )}

        {error && <p className="text-sm" style={{ color: '#e11d48' }}>{error}</p>}

        <Button type="submit" variant="primary" fullWidth disabled={loading || !url.trim()}>
          {loading ? 'Adding...' : 'Add Video'}
        </Button>
      </form>
    </Modal>
  )
}
