import { useState, useEffect, useRef, useMemo } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { addVideo, createCollection } from '@/api/client'
import { useDownloadPath } from '@/hooks/useDownloadPath'
import type { Collection, Video } from '@/types'

const PRESET_COLORS = [
  '#e11d48', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  '#14b8a6', '#64748b',
]

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
  const mouseDownOnBackdrop = useRef(false)
  const { theme } = useTheme()
  const [url, setUrl] = useState('')
  const [collectionId, setCollectionId] = useState<number | ''>(defaultCollectionId ?? '')
  const [notes, setNotes] = useState('')
  const [outputMp3, setOutputMp3] = useState(false)
  const [outputMp4, setOutputMp4] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const urlRef = useRef<HTMLInputElement>(null)

  // New collection inline form
  const [showNewColl, setShowNewColl] = useState(false)
  const [newCollName, setNewCollName] = useState('')
  const [newCollColor, setNewCollColor] = useState(PRESET_COLORS[0])
  const [creatingColl, setCreatingColl] = useState(false)
  const [extraCollections, setExtraCollections] = useState<Collection[]>([])
  const allCollections = useMemo(() => [
    ...collections,
    ...extraCollections.filter(ec => !collections.some(c => c.id === ec.id)),
  ], [collections, extraCollections])

  useEffect(() => {
    urlRef.current?.focus()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) {
      setError('Please enter a URL.')
      return
    }
    setLoading(true)
    setError(null)
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
      setNewCollColor(PRESET_COLORS[0])
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
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl"
        style={{ background: theme.surface, border: `1px solid ${theme.border}` }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: `1px solid ${theme.border}` }}
        >
          <h2 className="text-base font-bold" style={{ color: theme.text }}>
            Add Video
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: theme.text2 }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
          {/* URL */}
          <div>
            <label
              className="block text-xs font-semibold mb-1.5 tracking-wide"
              style={{ color: theme.text2 }}
            >
              Video URL
            </label>
            <input
              ref={urlRef}
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-all"
              style={{
                background: theme.surface2,
                border: `1px solid ${theme.border}`,
                color: theme.text,
              }}
              disabled={loading}
            />
          </div>

          {/* Collection */}
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
              style={{
                background: theme.surface2,
                border: `1px solid ${theme.border}`,
                color: theme.text,
              }}
              disabled={loading}
            >
              <option value="">No collection</option>
              {allCollections.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            {showNewColl && (
              <div
                className="mt-2 p-3 rounded-xl flex flex-col gap-2"
                style={{ background: theme.surface2, border: `1px solid ${theme.border}` }}
              >
                <div className="flex gap-1.5 flex-wrap">
                  {PRESET_COLORS.map(c => (
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
                <span className="text-xs font-semibold tracking-wide" style={{ color: theme.text2 }}>
                  Output folder
                </span>
                <span
                  className="text-xs font-mono truncate max-w-48"
                  style={{ color: theme.text2 }}
                  title={outputDir}
                >
                  {outputDir}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label
                  className="flex items-center gap-2.5 p-3 rounded-xl cursor-pointer transition-all border"
                  style={{
                    background: outputMp3 ? theme.surface2 : theme.surface,
                    borderColor: outputMp3 ? theme.accent : theme.border,
                    color: theme.text,
                  }}
                >
                  <div
                    className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 transition-colors"
                    style={{
                      background: outputMp3 ? theme.accent : theme.surface2,
                      color: outputMp3 ? 'white' : theme.text2,
                    }}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                      <path fillRule="evenodd" clipRule="evenodd" d="M10 1C9.73478 1 9.48043 1.10536 9.29289 1.29289L3.29289 7.29289C3.10536 7.48043 3 7.73478 3 8V20C3 21.6569 4.34315 23 6 23H7C7.55228 23 8 22.5523 8 22C8 21.4477 7.55228 21 7 21H6C5.44772 21 5 20.5523 5 20V9H10C10.5523 9 11 8.55228 11 8V3H18C18.5523 3 19 3.44772 19 4V7C19 7.55228 19.4477 8 20 8C20.5523 8 21 7.55228 21 7V4C21 2.34315 19.6569 1 18 1H10ZM9 7H6.41421L9 4.41421V7ZM12.5 24C13.8807 24 15 22.8807 15 21.5V12.8673L20 12.153V18.05C19.8384 18.0172 19.6712 18 19.5 18C18.1193 18 17 19.1193 17 20.5C17 21.8807 18.1193 23 19.5 23C20.8807 23 22 21.8807 22 20.5V11C22 10.7101 21.8742 10.4345 21.6552 10.2445C21.4362 10.0546 21.1456 9.96905 20.8586 10.0101L13.8586 11.0101C13.3659 11.0804 13 11.5023 13 12V19.05C12.8384 19.0172 12.6712 19 12.5 19C11.1193 19 10 20.1193 10 21.5C10 22.8807 11.1193 24 12.5 24Z" />
                    </svg>
                  </div>
                  <span className="text-sm font-semibold leading-tight">Output Audio</span>
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={outputMp3}
                    onChange={e => setOutputMp3(e.target.checked)}
                    disabled={loading}
                  />
                </label>

                <label
                  className="flex items-center gap-2.5 p-3 rounded-xl cursor-pointer transition-all border"
                  style={{
                    background: outputMp4 ? theme.surface2 : theme.surface,
                    borderColor: outputMp4 ? theme.accent : theme.border,
                    color: theme.text,
                  }}
                >
                  <div
                    className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 transition-colors"
                    style={{
                      background: outputMp4 ? theme.accent : theme.surface2,
                      color: outputMp4 ? 'white' : theme.text2,
                    }}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" xmlns="http://www.w3.org/2000/svg">
                      <path d="M19.5617 7C19.7904 5.69523 18.7863 4.5 17.4617 4.5H6.53788C5.21323 4.5 4.20922 5.69523 4.43784 7" />
                      <path d="M17.4999 4.5C17.5283 4.24092 17.5425 4.11135 17.5427 4.00435C17.545 2.98072 16.7739 2.12064 15.7561 2.01142C15.6497 2 15.5194 2 15.2588 2H8.74099C8.48035 2 8.35002 2 8.24362 2.01142C7.22584 2.12064 6.45481 2.98072 6.45704 4.00434C6.45727 4.11135 6.47146 4.2409 6.49983 4.5" />
                      <path d="M14.5812 13.6159C15.1396 13.9621 15.1396 14.8582 14.5812 15.2044L11.2096 17.2945C10.6669 17.6309 10 17.1931 10 16.5003L10 12.32C10 11.6273 10.6669 11.1894 11.2096 11.5258L14.5812 13.6159Z" />
                      <path d="M2.38351 13.793C1.93748 10.6294 1.71447 9.04765 2.66232 8.02383C3.61017 7 5.29758 7 8.67239 7H15.3276C18.7024 7 20.3898 7 21.3377 8.02383C22.2855 9.04765 22.0625 10.6294 21.6165 13.793L21.1935 16.793C20.8437 19.2739 20.6689 20.5143 19.7717 21.2572C18.8745 22 17.5512 22 14.9046 22H9.09536C6.44881 22 5.12553 22 4.22834 21.2572C3.33115 20.5143 3.15626 19.2739 2.80648 16.793L2.38351 13.793Z" />
                    </svg>
                  </div>
                  <span className="text-sm font-semibold leading-tight">Output Video</span>
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={outputMp4}
                    onChange={e => setOutputMp4(e.target.checked)}
                    disabled={loading}
                  />
                </label>
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm" style={{ color: '#e11d48' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #e11d48 0%, #9f1239 100%)' }}
          >
            {loading ? 'Adding...' : 'Add Video'}
          </button>
        </form>
      </div>
    </div>
  )
}
