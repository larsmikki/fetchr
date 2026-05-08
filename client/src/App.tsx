import { useState, useEffect, useCallback } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { PlayerProvider } from '@/contexts/PlayerContext'
import { DesktopProvider, useDesktop } from '@/contexts/DesktopContext'
import Layout from '@/components/Layout'
import AddVideoModal from '@/components/AddVideoModal'
import PersistentPlayer from '@/components/PersistentPlayer'
import FrontPage from '@/pages/FrontPage'
import CollectionPage from '@/pages/CollectionPage'
import SettingsPage from '@/pages/SettingsPage'
import DonatePage from '@/pages/DonatePage'
import { getCollections } from '@/api/client'
import type { Collection, Video } from '@/types'

function AppInner() {
  const [collections, setCollections] = useState<Collection[]>([])
  const [showAddVideo, setShowAddVideo] = useState(false)
  const [addVideoCollectionId, setAddVideoCollectionId] = useState<number | undefined>()
  const [refreshKey, setRefreshKey] = useState(0)

  const fetchCollections = useCallback(async () => {
    try {
      const res = await getCollections()
      setCollections(res.items)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    fetchCollections()
  }, [fetchCollections])

  const handleCollectionsChange = useCallback(() => {
    fetchCollections()
  }, [fetchCollections])

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
        <DesktopedApp />
      </DesktopProvider>
    </ThemeProvider>
  )
}
