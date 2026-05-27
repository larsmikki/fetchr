import { useState, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTheme } from '@/contexts/ThemeContext'
import { getVideos, deleteVideo } from '@/api'
import { queryKeys } from '@/queryKeys'
import VideoCard from '@/components/VideoCard'
import EditVideoModal from '@/components/EditVideoModal'
import { usePlayer } from '@/contexts/PlayerContext'
import { Button, Input, Select, Pill, Spinner } from '@/components/ui'
import type { Video, Collection } from '@/types'

interface FrontPageProps {
  collections: Collection[]
  onAddVideo: () => void
  refreshKey: number
  onCollectionsChange: () => void
}

const FETCH_LIMIT = 1000
const PILL_COLLAPSE_THRESHOLD = 6
const EMPTY_VIDEOS: Video[] = []

export default function FrontPage({ collections, onAddVideo, refreshKey, onCollectionsChange }: FrontPageProps) {
  const { theme } = useTheme()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [filterCollection, setFilterCollection] = useState<number | 'uncategorized' | null>(null)
  const { play } = usePlayer()
  const [editingVideo, setEditingVideo] = useState<Video | null>(null)

  const videosParams = useMemo(() => ({
    page: 1,
    limit: FETCH_LIMIT,
    q: search || undefined,
    collection_id: filterCollection ?? undefined,
    refreshKey,
  }), [filterCollection, refreshKey, search])
  const { data, isLoading: loading } = useQuery({
    queryKey: queryKeys.videos(videosParams),
    queryFn: () => getVideos({
        page: 1,
        limit: FETCH_LIMIT,
        q: search || undefined,
        collection_id: filterCollection ?? undefined,
    }),
    refetchInterval: query => query.state.data?.items.some(v => v.fetch_status === 'pending') ? 4000 : false,
  })
  const videos = data?.items ?? EMPTY_VIDEOS
  const total = data?.total ?? 0

  const invalidateVideos = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['videos'] })
  }, [queryClient])

  const collectionMap = useMemo(() => new Map(collections.map(c => [c.id, c])), [collections])

  const isGroupedMode = filterCollection === null && !search
  const videoGroups = useMemo(() => {
    if (!isGroupedMode || videos.length === 0) return null
    const grouped = new Map<number | null, Video[]>()
    for (const video of videos) {
      const key = video.collection_id
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(video)
    }
    const groups: Array<{ collection: Collection | null; videos: Video[] }> = []
    for (const col of collections) {
      const vids = grouped.get(col.id) ?? []
      if (vids.length > 0) groups.push({ collection: col, videos: vids })
    }
    const uncategorized = grouped.get(null) ?? []
    if (uncategorized.length > 0) groups.push({ collection: null, videos: uncategorized })
    return groups.length > 0 ? groups : null
  }, [isGroupedMode, videos, collections])

  const handleDelete = useCallback(async (video: Video) => {
    await deleteVideo(video.id)
    invalidateVideos()
  }, [invalidateVideos])

  const handleEditVideo = useCallback((video: Video) => setEditingVideo(video), [])

  const showDropdown = collections.length > PILL_COLLAPSE_THRESHOLD

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: theme.text }}>
            Your Videos
          </h1>
          <p className="text-sm mt-0.5" style={{ color: theme.text2 }}>
            {total} video{total !== 1 ? 's' : ''} in your library
          </p>
        </div>
        <Button
          variant="primary"
          size="lg"
          onClick={onAddVideo}
          leadingIcon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          }
        >
          Add Video
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <div className="relative">
          <svg
            className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            style={{ color: theme.text2 }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <Input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search videos..."
            className="!pl-10 !pr-10"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded"
              style={{ color: theme.text2 }}
              aria-label="Clear search"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {collections.length > 0 && (
          showDropdown ? (
            <div className="flex items-center gap-2 flex-wrap">
              <Pill active={filterCollection === null} onClick={() => setFilterCollection(null)}>All</Pill>
              <Pill active={filterCollection === 'uncategorized'} onClick={() => setFilterCollection(filterCollection === 'uncategorized' ? null : 'uncategorized')}>
                Uncategorized
              </Pill>
              <Select
                value={filterCollection === null || filterCollection === 'uncategorized' ? '' : String(filterCollection)}
                onChange={e => setFilterCollection(e.target.value === '' ? null : Number(e.target.value))}
                className="!w-auto !py-1.5 !text-xs"
              >
                <option value="">Filter by collection…</option>
                {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <Pill active={filterCollection === null} onClick={() => setFilterCollection(null)}>All</Pill>
              <Pill active={filterCollection === 'uncategorized'} onClick={() => setFilterCollection(filterCollection === 'uncategorized' ? null : 'uncategorized')}>
                Uncategorized
              </Pill>
              {collections.map(col => (
                <Pill
                  key={col.id}
                  active={filterCollection === col.id}
                  dot={col.color}
                  onClick={() => setFilterCollection(filterCollection === col.id ? null : col.id)}
                >
                  {col.name}
                </Pill>
              ))}
            </div>
          )
        )}
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
            <p className="font-semibold" style={{ color: theme.text }}>No videos yet</p>
            <p className="text-sm mt-1" style={{ color: theme.text2 }}>
              {search || filterCollection !== null ? 'No videos match your filter.' : 'Add your first video to get started.'}
            </p>
          </div>
          {!search && filterCollection === null && (
            <Button variant="primary" onClick={onAddVideo}>Add Video</Button>
          )}
        </div>
      ) : videoGroups ? (
        <div className="flex flex-col gap-8">
          {videoGroups.map(({ collection, videos: groupVideos }) => (
            <CollectionGroup
              key={collection?.id ?? 'uncategorized'}
              collection={collection}
              videos={groupVideos}
              collectionMap={collectionMap}
              onClick={play}
              onDelete={handleDelete}
              onEdit={handleEditVideo}
            />
          ))}
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
              showCollection={true}
            />
          ))}
        </div>
      )}

      {editingVideo && (
        <EditVideoModal
          video={editingVideo}
          collections={collections}
          onCollectionsChange={onCollectionsChange}
          onClose={() => setEditingVideo(null)}
          onSaved={() => { setEditingVideo(null); invalidateVideos() }}
        />
      )}
    </div>
  )
}

interface GroupProps {
  collection: Collection | null
  videos: Video[]
  collectionMap: Map<number, Collection>
  onClick: (video: Video) => void
  onDelete: (video: Video) => void
  onEdit: (video: Video) => void
}

function CollectionGroup({ collection, videos, collectionMap, onClick, onDelete, onEdit }: GroupProps) {
  const { theme } = useTheme()
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-4">
        {collection ? (
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: collection.color }} />
        ) : (
          <span className="w-2.5 h-2.5 rounded-full shrink-0 border" style={{ borderColor: theme.text2 }} />
        )}
        <h2 className="text-sm font-bold" style={{ color: theme.text }}>
          {collection ? collection.name : 'Uncategorized'}
        </h2>
        <span className="text-xs font-medium" style={{ color: theme.text2 }}>
          {videos.length}
        </span>
        <div className="flex-1 h-px" style={{ background: theme.border }} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
        {videos.map(video => (
          <VideoCard
            key={video.id}
            video={video}
            collectionMap={collectionMap}
            onClick={onClick}
            onDelete={onDelete}
            onEdit={onEdit}
            showCollection={false}
          />
        ))}
      </div>
    </div>
  )
}
