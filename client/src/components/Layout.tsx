import { useState, useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useTheme } from '@/contexts/ThemeContext'
import { usePlayer } from '@/contexts/PlayerContext'
import { useDesktop } from '@/contexts/DesktopContext'
import Footer from '@/components/Footer'

function MiniPlayerBar() {
  const { video, mode, videoRef, expand, close, musicMode, toggleMusicMode } = usePlayer()
  const { theme } = useTheme()
  const [progress, setProgress] = useState(0)
  const [paused, setPaused] = useState(false)

  const isActive = mode === 'mini' && !!video

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    const onTime = () => setProgress(el.duration ? el.currentTime / el.duration : 0)
    const onPlay = () => setPaused(false)
    const onPause = () => setPaused(true)
    el.addEventListener('timeupdate', onTime)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    return () => {
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
    }
  }, [videoRef, mode])

  const togglePlay = () => {
    const el = videoRef.current
    if (!el) return
    el.paused ? el.play() : el.pause()
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = videoRef.current
    if (!el || !el.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    el.currentTime = ((e.clientX - rect.left) / rect.width) * el.duration
  }

  const MusicModeButton = (
    <button
      onClick={toggleMusicMode}
      className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
      style={{ color: musicMode ? theme.accent : theme.text2 }}
      title={musicMode ? 'Music mode on — click to disable' : 'Music mode — play without opening video'}
    >
      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
        <path d="M18 3a1 1 0 0 0-1.196-.98l-10 2A1 1 0 0 0 6 5v9.114A4.369 4.369 0 0 0 5 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0 0 15 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" />
      </svg>
    </button>
  )

  return (
    <div style={{ borderTop: `1px solid ${theme.border}`, background: theme.surface }}>
      {isActive && (
        <div
          className="w-full cursor-pointer"
          style={{ height: 3, background: theme.surface2 }}
          onClick={handleSeek}
        >
          <div style={{ height: '100%', width: `${progress * 100}%`, background: theme.accent, transition: 'width 0.25s linear' }} />
        </div>
      )}

      <div className="flex items-center gap-3 px-4" style={{ height: isActive ? 52 : 40 }}>
        {isActive && video && (
          <>
            <img
              src={`/api/videos/${video.id}/thumbnail`}
              alt=""
              className="rounded shrink-0"
              style={{ width: 36, height: 36, objectFit: 'cover' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />

            <span className="flex-1 text-sm font-medium truncate min-w-0" style={{ color: theme.text }}>
              {video.title || 'Untitled'}
            </span>

            <button
              onClick={togglePlay}
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
              style={{ color: theme.text2 }}
              title={paused ? 'Play' : 'Pause'}
            >
              {paused ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              )}
            </button>

            <button
              onClick={expand}
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
              style={{ color: theme.text2 }}
              title="Expand"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" />
              </svg>
            </button>

            <button
              onClick={close}
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
              style={{ color: theme.text2 }}
              title="Close"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </>
        )}

        {/* Music mode toggle — always visible, right-aligned when idle */}
        {!isActive && <div className="ml-auto" />}
        {MusicModeButton}
      </div>
    </div>
  )
}

function LogoMark({ size = 28 }: { size?: number }) {
  return <img src="/favicon.svg" width={size} height={size} alt="Reely" className="shrink-0" />
}

export default function Layout() {
  const { theme } = useTheme()
  const { desktop, switchDesktop } = useDesktop()
  const location = useLocation()

  return (
    <div className="min-h-screen flex flex-col" style={{ background: theme.bg, color: theme.text }}>
      <header
        className="sticky top-0 z-40 backdrop-blur-md"
        style={{
          background: `${theme.surface}dd`,
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 shrink-0" style={{ textDecoration: 'none' }}>
            <LogoMark size={28} />
            <span className="text-xl font-extrabold tracking-tight gradient-text select-none">
              Reely
            </span>
          </Link>

          <nav className="flex items-center gap-0.5">
            {([1, 2] as const).map(d => (
              <button
                key={d}
                onClick={() => switchDesktop(d)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150"
                style={
                  desktop === d
                    ? { background: `${theme.accent}22`, color: theme.accent }
                    : { color: theme.text2 }
                }
                title={`Desktop ${d}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M3 4a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 13a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1v-3zM13 3a1 1 0 00-1 1v3a1 1 0 001 1h3a1 1 0 001-1V4a1 1 0 00-1-1h-3zM13 12a1 1 0 00-1 1v3a1 1 0 001 1h3a1 1 0 001-1v-3a1 1 0 00-1-1h-3z" />
                </svg>
                <span className="hidden sm:inline">Desk {d}</span>
              </button>
            ))}

            <Link
              to="/settings"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150"
              style={
                location.pathname === '/settings'
                  ? { background: `${theme.accent}22`, color: theme.accent }
                  : { color: theme.text2 }
              }
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
              <span className="hidden sm:inline">Settings</span>
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      <MiniPlayerBar />
      <Footer />
    </div>
  )
}
