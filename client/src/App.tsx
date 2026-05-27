import { useState, useCallback } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { PlayerProvider } from '@/contexts/PlayerContext'
import { DesktopProvider, useDesktop } from '@/contexts/DesktopContext'
import { JobsProvider } from '@/contexts/JobsContext'
import Layout from '@/components/Layout'
import AddVideoModal from '@/components/AddVideoModal'
import PersistentPlayer from '@/components/PersistentPlayer'
import FrontPage from '@/pages/FrontPage'
import CollectionPage from '@/pages/CollectionPage'
import SettingsPage from '@/pages/SettingsPage'
import DonatePage from '@/pages/DonatePage'
import { getCollections } from '@/api'
import { queryKeys } from '@/queryKeys'
import type { Video } from '@/types'

function AppInner() {
  const queryClient = useQueryClient()
  const [showAddVideo, setShowAddVideo] = useState(false)
  const [addVideoCollectionId, setAddVideoCollectionId] = useState<number | undefined>()
  const [refreshKey, setRefreshKey] = useState(0)

  const { data: collections = [] } = useQuery({
    queryKey: queryKeys.collections,
    queryFn: async () => (await getCollections()).items,
  })

  const handleCollectionsChange = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.collections })
  }, [queryClient])

  const handleAddVideo = useCallback((collectionId?: number) => {
    setAddVideoCollectionId(collectionId)
    setShowAddVideo(true)
  }, [])

  const handleVideoAdded = useCallback((_video: Video) => {
    setRefreshKey(k => k + 1)
    handleCollectionsChange()
  }, [handleCollectionsChange])

  return (
    <BrowserRouter>
      <Routes>
        <Route
          element={<Layout />}
        >
          <Route
            index
            element={
              <FrontPage
                collections={collections}
                onAddVideo={handleAddVideo}
                refreshKey={refreshKey}
                onCollectionsChange={handleCollectionsChange}
              />
            }
          />
          <Route
            path="/collections/:id"
            element={
              <CollectionPage
                collections={collections}
                onAddVideo={handleAddVideo}
                onCollectionsChange={handleCollectionsChange}
                refreshKey={refreshKey}
              />
            }
          />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/donate" element={<DonatePage />} />
        </Route>
      </Routes>

      {showAddVideo && (
        <AddVideoModal
          collections={collections}
          defaultCollectionId={addVideoCollectionId}
          onClose={() => setShowAddVideo(false)}
          onAdded={handleVideoAdded}
          onCollectionsChange={handleCollectionsChange}
        />
      )}

      <PersistentPlayer collections={collections} />
    </BrowserRouter>
  )
}

function DesktopedApp() {
  const { desktop } = useDesktop()
  return (
    <PlayerProvider key={desktop} desktop={desktop}>
      <AppInner />
    </PlayerProvider>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <DesktopProvider>
        <JobsProvider>
          <DesktopedApp />
        </JobsProvider>
      </DesktopProvider>
    </ThemeProvider>
  )
}
