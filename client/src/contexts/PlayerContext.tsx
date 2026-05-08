import { createContext, useContext, useState, useRef, useEffect, useCallback, useMemo } from 'react'
import type { RefObject, ReactNode, MutableRefObject } from 'react'
import type { Video } from '@/types'
import { getVideoById } from '@/api/client'

export type PlayerMode = 'full' | 'mini' | 'closed'

interface PlayerContextValue {
  video: Video | null
  mode: PlayerMode
  videoRef: RefObject<HTMLVideoElement | null>
  musicMode: boolean
  pendingSeekTime: MutableRefObject<number | null>
  play: (video: Video) => void
  minimize: () => void
  expand: () => void
  close: () => void
  toggleMusicMode: () => void
}

const PlayerContext = createContext<PlayerContextValue | null>(null)

const MUSIC_MODE_KEY = 'reely_music_mode'

export function PlayerProvider({ children, desktop }: { children: ReactNode; desktop: 1 | 2 }) {
  const storageKey = `reely_player_d${desktop}`

  const [video, setVideo] = useState<Video | null>(null)
  const [mode, setMode] = useState<PlayerMode>('closed')
  const [musicMode, setMusicMode] = useState<boolean>(() => {
    try { return localStorage.getItem(MUSIC_MODE_KEY) === '1' } catch { return false }
  })
  const videoRef = useRef<HTMLVideoElement>(null)
  const pendingSeekTime = useRef<number | null>(null)
  const musicModeRef = useRef(musicMode)
  musicModeRef.current = musicMode

  // On mount: restore last video if music mode was on
  useEffect(() => {
    if (!musicModeRef.current) return
    try {
      const stored = localStorage.getItem(storageKey)
      if (!stored) return
      const { videoId, time } = JSON.parse(stored) as { videoId: number; time: number }
      if (!videoId) return
      getVideoById(videoId)
        .then(v => {
          setVideo(v)
          setMode('mini')
          if (time > 5) pendingSeekTime.current = time
        })
        .catch(() => {})
    } catch {}
  }, [storageKey])

  // Persist video ID when it changes (music mode only)
  useEffect(() => {
    if (!musicMode || !video) return
    try {
      localStorage.setItem(storageKey, JSON.stringify({ videoId: video.id, time: 0 }))
    } catch {}
  }, [video, musicMode, storageKey])

  // Save currentTime every 5s (music mode only)
  useEffect(() => {
    if (!musicMode || !video) return
    const interval = setInterval(() => {
      const el = videoRef.current
      if (el && el.currentTime > 0) {
        try {
          localStorage.setItem(storageKey, JSON.stringify({ videoId: video.id, time: Math.floor(el.currentTime) }))
        } catch {}
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [musicMode, video, storageKey])

  const play = useCallback((v: Video) => {
    setVideo(v)
    setMode(musicModeRef.current ? 'mini' : 'full')
  }, [])

  const minimize = useCallback(() => setMode('mini'), [])
  const expand = useCallback(() => setMode('full'), [])

  const close = useCallback(() => {
    setMode('closed')
    setVideo(null)
    try { localStorage.removeItem(storageKey) } catch {}
  }, [storageKey])

  const toggleMusicMode = useCallback(() => {
    setMusicMode(prev => {
      const next = !prev
      try {
        localStorage.setItem(MUSIC_MODE_KEY, next ? '1' : '0')
        if (!next) localStorage.removeItem(storageKey)
      } catch {}
      return next
    })
  }, [storageKey])

  const value = useMemo(() => ({
    video, mode, videoRef, musicMode, pendingSeekTime,
    play, minimize, expand, close, toggleMusicMode,
  }), [video, mode, musicMode, play, minimize, expand, close, toggleMusicMode])

  return (
    <PlayerContext.Provider value={value}>
      {children}
    </PlayerContext.Provider>
  )
}

export function usePlayer() {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider')
  return ctx
}
