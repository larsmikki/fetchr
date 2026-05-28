import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import ThemePicker from '@/components/ThemePicker'
import FolderPicker from '@/components/FolderPicker'
import { getSettings, updateSettings, exportData, importData, downloadAllVideos, regenerateSidecars, importSidecars, refreshThumbnails, cancelJob, retryJob, ignoreJob, cleanupAndRetryVideo, getFailedJobs, getCookieStatus, uploadCookies, deleteCookies } from '@/api'
import { Button, Input, Surface, ConfirmDialog } from '@/components/ui'
import { useJobs, JOB_KIND_LABEL, type Job } from '@/contexts/JobsContext'

function formatAge(updatedAt: string): string {
  const then = new Date(updatedAt.includes('T') ? updatedAt : updatedAt.replace(' ', 'T') + 'Z').getTime()
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

function JobsPanel() {
  const { theme } = useTheme()
  const { jobs } = useJobs()
  const [failed, setFailed] = useState<Job[]>([])
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, force] = useState(0)

  // Re-render once a second so the "age" column ticks for stuck jobs
  useEffect(() => {
    const t = setInterval(() => force(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const refreshFailed = useCallback(() => {
    getFailedJobs().then(r => setFailed(r.items)).catch(() => {})
  }, [])

  // Fetch persisted failures on mount, and again whenever any live job changes
  // status. A new error must be captured before its SSE entry is dropped (~10s);
  // a later success must drop the now-superseded failure from the list.
  const liveStatusSig = jobs.map(j => `${j.id}:${j.status}`).sort().join(',')
  useEffect(() => { refreshFailed() }, [refreshFailed, liveStatusSig])

  // Live jobs (active + recently-completed from SSE) win over the persisted
  // copy; show most recent activity first.
  const merged = useMemo(() => {
    const byId = new Map<number, Job>()
    for (const j of failed) byId.set(j.id, j)
    for (const j of jobs) byId.set(j.id, j)
    const all = Array.from(byId.values())
    const superseded = (j: Job) =>
      j.status === 'error' &&
      all.some(s => s.status === 'ok' && s.video_id === j.video_id && s.kind === j.kind && s.id > j.id)
    return all
      .filter(j => !superseded(j))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id - a.id)
  }, [failed, jobs])

  const handleCancel = async (job: Job) => {
    setBusyId(job.id)
    setError(null)
    try { await cancelJob(job.id) }
    catch (e) { setError(e instanceof Error ? e.message : 'Cancel failed') }
    finally { setBusyId(null); refreshFailed() }
  }

  const handleRetry = async (job: Job) => {
    setBusyId(job.id)
    setError(null)
    try { await retryJob(job.id) }
    catch (e) { setError(e instanceof Error ? e.message : 'Retry failed') }
    finally { setBusyId(null); refreshFailed() }
  }

  const handleCleanupRetry = async (job: Job) => {
    if (job.video_id == null) return
    if (!confirm('Cancel all jobs for this video, delete any partial files, and restart the download from scratch?')) return
    setBusyId(job.id)
    setError(null)
    try { await cleanupAndRetryVideo(job.video_id) }
    catch (e) { setError(e instanceof Error ? e.message : 'Cleanup failed') }
    finally { setBusyId(null); refreshFailed() }
  }

  const handleIgnore = async (job: Job) => {
    setBusyId(job.id)
    setError(null)
    try { await ignoreJob(job.id) }
    catch (e) { setError(e instanceof Error ? e.message : 'Ignore failed') }
    finally { setBusyId(null); refreshFailed() }
  }

  return (
    <Surface className="p-6 mb-5">
      <h2 className="text-base font-bold mb-1" style={{ color: theme.text }}>Job queue</h2>
      <p className="text-xs mb-5" style={{ color: theme.text2 }}>
        Active jobs and recent failures. Cancel any download that appears stuck to unblock the queue, or retry a failed one.
      </p>

      {merged.length === 0 ? (
        <p className="text-sm" style={{ color: theme.text2 }}>No active jobs or recent failures.</p>
      ) : (
        <ul className="space-y-2">
          {merged.map(job => {
            const pct = Math.round((job.progress ?? 0) * 100)
            const canCancel = job.status === 'pending' || job.status === 'running'
            const canRetry = job.status === 'error' || job.status === 'cancelled'
            return (
              <li
                key={job.id}
                className="flex items-center gap-3 p-3 rounded"
                style={{ background: theme.surface2, border: `1px solid ${theme.border}` }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium" style={{ color: theme.text }}>
                      #{job.id} · {JOB_KIND_LABEL[job.kind]}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded" style={{ background: theme.surface, color: theme.text2 }}>
                      {job.status}
                    </span>
                    <span className="text-xs" style={{ color: theme.text2 }}>
                      {formatAge(job.updated_at)}
                    </span>
                    {job.attempts > 1 && (
                      <span className="text-xs" style={{ color: theme.text2 }}>
                        attempt {job.attempts}/{job.max_attempts}
                      </span>
                    )}
                  </div>
                  {job.status === 'running' && (
                    <div className="mt-1.5 h-1 rounded overflow-hidden" style={{ background: theme.surface }}>
                      <div className="h-full transition-all" style={{ width: `${pct}%`, background: theme.accent }} />
                    </div>
                  )}
                  {job.error && (
                    <p className="text-xs mt-1 break-words whitespace-pre-wrap select-text" style={{ color: theme.text2 }}>
                      {job.error}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  {canCancel && (
                    <Button variant="ghost" size="sm" onClick={() => handleCancel(job)} disabled={busyId === job.id}>
                      Cancel
                    </Button>
                  )}
                  {canRetry && (
                    <Button variant="primary" size="sm" onClick={() => handleRetry(job)} disabled={busyId === job.id}>
                      Retry
                    </Button>
                  )}
                  {canRetry && job.video_id != null && (
                    <Button variant="danger" size="sm" onClick={() => handleCleanupRetry(job)} disabled={busyId === job.id}>
                      Clean & retry
                    </Button>
                  )}
                  {canRetry && (
                    <Button variant="ghost" size="sm" onClick={() => handleIgnore(job)} disabled={busyId === job.id}>
                      Ignore
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {error && <p className="text-xs mt-3" style={{ color: theme.accent }}>{error}</p>}
    </Surface>
  )
}

export default function SettingsPage() {
  const { theme } = useTheme()
  const [downloadPath, setDownloadPath] = useState('')
  const [downloadPathSaved, setDownloadPathSaved] = useState(false)
  const [downloadPathLoading, setDownloadPathLoading] = useState(false)
  const [ffmpegPath, setFfmpegPath] = useState('')
  const [ffmpegPathSaved, setFfmpegPathSaved] = useState(false)
  const [ffmpegPathLoading, setFfmpegPathLoading] = useState(false)
  const [cookieMode, setCookieMode] = useState<'file' | 'browser'>('file')
  const [cookieBrowser, setCookieBrowser] = useState('')
  const [cookieBrowserSaved, setCookieBrowserSaved] = useState(false)
  const [cookieBrowserLoading, setCookieBrowserLoading] = useState(false)
  const [cookiePresent, setCookiePresent] = useState(false)
  const [cookieUpdatedAt, setCookieUpdatedAt] = useState<string | null>(null)
  const [cookieStatus, setCookieStatus] = useState<string | null>(null)
  const [cookieUploading, setCookieUploading] = useState(false)
  const cookieRef = useRef<HTMLInputElement>(null)
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const [browse, setBrowse] = useState<'download' | 'ffmpeg' | null>(null)
  const [sidecarStatus, setSidecarStatus] = useState<string | null>(null)
  const [sidecarLoading, setSidecarLoading] = useState(false)
  const [importSidecarStatus, setImportSidecarStatus] = useState<string | null>(null)
  const [importSidecarLoading, setImportSidecarLoading] = useState(false)
  const [importSidecarConfirmOpen, setImportSidecarConfirmOpen] = useState(false)
  const [thumbsStatus, setThumbsStatus] = useState<string | null>(null)
  const [thumbsLoading, setThumbsLoading] = useState(false)

  useEffect(() => {
    getSettings().then(s => {
      if (s.download_path) setDownloadPath(s.download_path)
      if (s.ffmpeg_path) setFfmpegPath(s.ffmpeg_path)
      if (s.youtube_cookies_mode === 'browser') setCookieMode('browser')
      if (s.youtube_cookies_browser) setCookieBrowser(s.youtube_cookies_browser)
    }).catch(() => {})
    getCookieStatus().then(c => {
      setCookiePresent(c.present)
      setCookieUpdatedAt(c.updatedAt)
    }).catch(() => {})
  }, [])

  const saveDownloadPath = async (e: React.FormEvent) => {
    e.preventDefault()
    setDownloadPathLoading(true)
    try {
      await updateSettings({ download_path: downloadPath })
      setDownloadPathSaved(true)
      setTimeout(() => setDownloadPathSaved(false), 2000)
    } catch { /* ignore */ }
    finally { setDownloadPathLoading(false) }
  }

  const saveFfmpegPath = async (e: React.FormEvent) => {
    e.preventDefault()
    setFfmpegPathLoading(true)
    try {
      await updateSettings({ ffmpeg_path: ffmpegPath })
      setFfmpegPathSaved(true)
      setTimeout(() => setFfmpegPathSaved(false), 2000)
    } catch { /* ignore */ }
    finally { setFfmpegPathLoading(false) }
  }

  const selectCookieMode = async (mode: 'file' | 'browser') => {
    setCookieMode(mode)
    setCookieStatus(null)
    try { await updateSettings({ youtube_cookies_mode: mode }) } catch { /* ignore */ }
  }

  const saveCookieBrowser = async (e: React.FormEvent) => {
    e.preventDefault()
    setCookieBrowserLoading(true)
    try {
      await updateSettings({ youtube_cookies_browser: cookieBrowser.trim(), youtube_cookies_mode: 'browser' })
      setCookieBrowserSaved(true)
      setTimeout(() => setCookieBrowserSaved(false), 2000)
    } catch { /* ignore */ }
    finally { setCookieBrowserLoading(false) }
  }

  const handleCookieUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setCookieUploading(true)
    setCookieStatus(null)
    try {
      const content = await file.text()
      const res = await uploadCookies(content)
      const status = await getCookieStatus()
      setCookiePresent(status.present)
      setCookieUpdatedAt(status.updatedAt)
      setCookieMode('file')
      setCookieStatus(res.looksValid
        ? `Uploaded ${file.name}`
        : `Uploaded ${file.name}, but it doesn't look like a Netscape cookies.txt — yt-dlp may reject it.`)
    } catch (err) {
      setCookieStatus(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setCookieUploading(false)
    }
  }

  const handleRemoveCookies = async () => {
    if (!window.confirm('Remove the uploaded cookies file?')) return
    try {
      await deleteCookies()
      setCookiePresent(false)
      setCookieUpdatedAt(null)
      setCookieStatus('Removed')
    } catch (err) {
      setCookieStatus(err instanceof Error ? err.message : 'Remove failed')
    }
  }

  const handleRegenerateSidecars = async () => {
    setSidecarLoading(true)
    setSidecarStatus(null)
    try {
      const result = await regenerateSidecars()
      const failedSuffix = result.failed > 0 ? `, ${result.failed} failed` : ''
      setSidecarStatus(`Regenerated ${result.written} of ${result.total} sidecar${result.total !== 1 ? 's' : ''}${failedSuffix}`)
      setTimeout(() => setSidecarStatus(null), 4000)
    } catch (err) {
      setSidecarStatus(err instanceof Error ? err.message : 'Failed')
      setTimeout(() => setSidecarStatus(null), 4000)
    } finally {
      setSidecarLoading(false)
    }
  }

  const handleRefreshThumbnails = async (all: boolean) => {
    setThumbsLoading(true)
    setThumbsStatus(null)
    try {
      const r = await refreshThumbnails(all)
      setThumbsStatus(r.enqueued === 0
        ? 'No videos needed a thumbnail refresh.'
        : `Queued ${r.enqueued} thumbnail job${r.enqueued !== 1 ? 's' : ''}.`)
      setTimeout(() => setThumbsStatus(null), 6000)
    } catch (err) {
      setThumbsStatus(err instanceof Error ? err.message : 'Failed')
      setTimeout(() => setThumbsStatus(null), 6000)
    } finally {
      setThumbsLoading(false)
    }
  }

  const runImportSidecars = async () => {
    setImportSidecarLoading(true)
    setImportSidecarStatus(null)
    try {
      const r = await importSidecars()
      const parts = [`Imported ${r.imported} of ${r.total}`]
      if (r.replaced > 0) parts.push(`${r.replaced} replaced`)
      if (r.skippedNoMedia > 0) parts.push(`${r.skippedNoMedia} skipped (no media)`)
      if (r.failed > 0) parts.push(`${r.failed} failed`)
      setImportSidecarStatus(parts.join(', '))
      setTimeout(() => setImportSidecarStatus(null), 6000)
    } catch (err) {
      setImportSidecarStatus(err instanceof Error ? err.message : 'Failed')
      setTimeout(() => setImportSidecarStatus(null), 6000)
    } finally {
      setImportSidecarLoading(false)
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImportStatus('Importing...')
    try {
      const result = await importData(file)
      setImportStatus(`Imported ${result.imported} video${result.imported !== 1 ? 's' : ''}`)
      setTimeout(() => setImportStatus(null), 4000)
    } catch (err) {
      setImportStatus(err instanceof Error ? err.message : 'Import failed')
      setTimeout(() => setImportStatus(null), 4000)
    }
  }

  return (
    <>
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: theme.text }}>Settings</h1>
          <p className="text-sm mt-0.5" style={{ color: theme.text2 }}>Customize your Fetchr experience.</p>
        </div>

        <Surface className="p-6 mb-5">
          <h2 className="text-base font-bold mb-1" style={{ color: theme.text }}>Themes</h2>
          <p className="text-xs mb-5" style={{ color: theme.text2 }}>Choose a color theme for the interface.</p>
          <ThemePicker />
        </Surface>

        <JobsPanel />

        <Surface className="p-6 mb-5">
          <h2 className="text-base font-bold mb-1" style={{ color: theme.text }}>Downloads</h2>
          <p className="text-xs mb-5" style={{ color: theme.text2 }}>
            When set, newly added videos are automatically downloaded to this folder using yt-dlp.
            Supports local paths and network shares (e.g. <code style={{ color: theme.accent }}>\\server\share\videos</code>).
          </p>
          <form onSubmit={saveDownloadPath} className="flex items-center gap-2 flex-wrap">
            <Input
              type="text"
              value={downloadPath}
              onChange={e => setDownloadPath(e.target.value)}
              placeholder="e.g. C:\Videos or \\nas\media\videos"
              className="!flex-1 !w-auto min-w-0"
            />
            <Button type="button" variant="secondary" onClick={() => setBrowse('download')}>Browse</Button>
            <Button type="submit" variant="primary" disabled={downloadPathLoading}>
              {downloadPathLoading ? 'Saving...' : 'Save'}
            </Button>
            {downloadPathSaved && <span className="text-sm font-medium" style={{ color: theme.accent }}>Saved</span>}
          </form>

          <p className="text-xs mt-5 mb-2" style={{ color: theme.text2 }}>
            ffmpeg path override for MP3 downloads. Leave blank to use the bundled ffmpeg.
          </p>
          <form onSubmit={saveFfmpegPath} className="flex items-center gap-2 flex-wrap">
            <Input
              type="text"
              value={ffmpegPath}
              onChange={e => setFfmpegPath(e.target.value)}
              placeholder="e.g. C:\ffmpeg\bin"
              className="!flex-1 !w-auto min-w-0"
            />
            <Button type="button" variant="secondary" onClick={() => setBrowse('ffmpeg')}>Browse</Button>
            <Button type="submit" variant="primary" disabled={ffmpegPathLoading}>
              {ffmpegPathLoading ? 'Saving...' : 'Save'}
            </Button>
            {ffmpegPathSaved && <span className="text-sm font-medium" style={{ color: theme.accent }}>Saved</span>}
          </form>
        </Surface>

        <Surface className="p-6 mb-5">
          <h2 className="text-base font-bold mb-1" style={{ color: theme.text }}>YouTube authentication</h2>
          <p className="text-xs mb-4" style={{ color: theme.text2 }}>
            Some videos need a logged-in session — age-restricted ones, or those that fail with
            “Sign in to confirm…”. Choose how to provide YouTube cookies.
          </p>

          <div className="grid gap-3 sm:grid-cols-2 mb-4">
            {([
              {
                value: 'file' as const,
                label: 'Cookie file',
                description: 'Upload a cookies.txt — recommended, works in Docker',
                preview: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 7.5 12 3m0 0L7.5 7.5M12 3v13.5" />
                  </svg>
                ),
              },
              {
                value: 'browser' as const,
                label: 'From browser',
                description: 'Read cookies from a browser on the server',
                preview: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path strokeLinecap="round" d="M3 9h18" />
                    <circle cx="6" cy="7" r="0.55" fill="currentColor" stroke="none" />
                    <circle cx="8.2" cy="7" r="0.55" fill="currentColor" stroke="none" />
                  </svg>
                ),
              },
            ] as const).map(({ value, label, description, preview }) => (
              <button
                key={value}
                type="button"
                onClick={() => selectCookieMode(value)}
                className="flex flex-col gap-3 p-4 rounded-xl text-left transition-opacity hover:opacity-90"
                style={{
                  border: `1px solid ${cookieMode === value ? theme.accent : theme.border}`,
                  background: cookieMode === value ? `${theme.accent}08` : theme.surface2,
                  boxShadow: cookieMode === value ? `0 0 0 3px ${theme.accent}15` : 'none',
                }}
              >
                <div
                  className="w-full rounded-lg p-3 flex items-center justify-center"
                  style={{
                    background: theme.surface,
                    border: `1px solid ${theme.border}`,
                    minHeight: '60px',
                    color: cookieMode === value ? theme.accent : theme.text2,
                  }}
                >
                  {preview}
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: theme.text }}>{label}</p>
                  <p className="text-xs mt-0.5" style={{ color: theme.text2 }}>{description}</p>
                </div>
              </button>
            ))}
          </div>

          {cookieMode === 'file' ? (
            <div>
              <ol className="text-xs space-y-1.5 mb-4 list-decimal pl-4" style={{ color: theme.text2 }}>
                <li>
                  Install the{' '}
                  <a
                    href="https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                    style={{ color: theme.accent }}
                  >Get cookies.txt LOCALLY</a>{' '}
                  extension (Chrome/Edge; the Firefox build is linked from its{' '}
                  <a
                    href="https://github.com/kairi003/Get-cookies.txt-LOCALLY"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                    style={{ color: theme.accent }}
                  >GitHub page</a>).
                </li>
                <li>Sign in to YouTube, open <code style={{ color: theme.accent }}>youtube.com</code>, and use the extension to export cookies in <strong>Netscape</strong> format.</li>
                <li>Upload that file below — it’s stored on the server and reused for every download (ideal for Docker, where there’s no browser to read).</li>
              </ol>
              <p className="text-[11px] mb-4" style={{ color: theme.text2 }}>
                Tip: export from a private/incognito window and close it right afterward — YouTube rotates cookies, so continuing to browse in that session can invalidate the file.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input ref={cookieRef} type="file" accept=".txt,text/plain" className="hidden" onChange={handleCookieUpload} />
                <Button variant="primary" onClick={() => cookieRef.current?.click()} disabled={cookieUploading}>
                  {cookieUploading ? 'Uploading...' : cookiePresent ? 'Replace cookies.txt' : 'Upload cookies.txt'}
                </Button>
                {cookiePresent && (
                  <Button variant="secondary" onClick={handleRemoveCookies}>Remove</Button>
                )}
                {cookiePresent && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: theme.text2 }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: '#22c55e' }} />
                    Cookie file in use{cookieUpdatedAt ? ` · updated ${formatAge(cookieUpdatedAt)}` : ''}
                  </span>
                )}
              </div>
              <p className="text-[11px] mt-3" style={{ color: theme.text2 }}>
                Cookies expire after a while — if downloads start failing again, re-export and upload a fresh file.
              </p>
            </div>
          ) : (
            <form onSubmit={saveCookieBrowser} className="flex flex-col gap-2">
              <p className="text-xs" style={{ color: theme.text2 }}>
                Reads cookies straight from a browser profile on the <strong>server</strong>. This won’t work in Docker (no browser installed) and can fail while that browser is running.
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <Input
                  type="text"
                  value={cookieBrowser}
                  onChange={e => setCookieBrowser(e.target.value)}
                  placeholder="chrome, firefox, edge, brave, opera, vivaldi, chromium, safari (e.g. firefox:Default)"
                  className="!flex-1 !w-auto min-w-0"
                />
                <Button type="submit" variant="primary" disabled={cookieBrowserLoading}>
                  {cookieBrowserLoading ? 'Saving...' : 'Save'}
                </Button>
                {cookieBrowserSaved && <span className="text-sm font-medium" style={{ color: theme.accent }}>Saved</span>}
              </div>
            </form>
          )}

          {cookieStatus && (
            <p className="text-xs mt-3 font-medium" style={{ color: theme.accent }}>{cookieStatus}</p>
          )}
        </Surface>

        <Surface className="p-6 mb-5">
          <h2 className="text-base font-bold mb-1" style={{ color: theme.text }}>App Data</h2>
          <p className="text-xs mb-5" style={{ color: theme.text2 }}>
            Export all your video URLs and collections as a JSON backup. Import restores them without triggering downloads — you can download each video manually afterwards.
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            <Button
              variant="secondary"
              onClick={exportData}
              leadingIcon={
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              }
            >
              Export Settings
            </Button>
            <Button
              variant="secondary"
              onClick={() => importRef.current?.click()}
              leadingIcon={
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              }
            >
              Import Settings
            </Button>
            <input ref={importRef} type="file" accept=".json,application/json" className="hidden" onChange={handleImport} />
            {importStatus && (
              <span className="text-sm font-medium" style={{ color: theme.accent }}>{importStatus}</span>
            )}
          </div>

          <div className="mt-5 pt-5" style={{ borderTop: `1px solid ${theme.border}` }}>
            <p className="text-xs mb-3" style={{ color: theme.text2 }}>
              Download all locally saved videos as a ZIP file. Large collections may take a while to package.
            </p>
            <Button variant="secondary" onClick={downloadAllVideos}>Download all videos</Button>
          </div>

        </Surface>

        <Surface className="p-6 mb-5">
          <h2 className="text-base font-bold mb-1" style={{ color: theme.text }}>Sidecars</h2>
          <p className="text-xs mb-5" style={{ color: theme.text2 }}>
            Each downloaded video gets a JSON sidecar (title, site, collection, page URL) next to the media file. Sidecars are written automatically — use these tools to backfill or restore.
          </p>

          <div>
            <p className="text-xs mb-3" style={{ color: theme.text2 }}>
              Write a JSON sidecar next to every locally downloaded video. Run this once to backfill the existing library.
            </p>
            <div className="flex flex-wrap gap-2 items-center">
              <Button variant="secondary" onClick={handleRegenerateSidecars} disabled={sidecarLoading}>
                {sidecarLoading ? 'Regenerating...' : 'Regenerate sidecars'}
              </Button>
              {sidecarStatus && (
                <span className="text-sm font-medium" style={{ color: theme.accent }}>{sidecarStatus}</span>
              )}
            </div>
          </div>

          <div className="mt-5 pt-5" style={{ borderTop: `1px solid ${theme.border}` }}>
            <p className="text-xs mb-3" style={{ color: theme.text2 }}>
              Restore videos from a backup by scanning the videos folder. Each <code style={{ color: theme.accent }}>{'<id>.<ext>.json'}</code> sidecar with a matching media file is imported, reusing its original id. On conflict (same id or page URL), the existing row is replaced.
            </p>
            <div className="flex flex-wrap gap-2 items-center">
              <Button variant="secondary" onClick={() => setImportSidecarConfirmOpen(true)} disabled={importSidecarLoading}>
                {importSidecarLoading ? 'Importing...' : 'Import from sidecars'}
              </Button>
              {importSidecarStatus && (
                <span className="text-sm font-medium" style={{ color: theme.accent }}>{importSidecarStatus}</span>
              )}
            </div>
          </div>

          <div className="mt-5 pt-5" style={{ borderTop: `1px solid ${theme.border}` }}>
            <p className="text-xs mb-3" style={{ color: theme.text2 }}>
              Re-fetch the thumbnail for every video by querying its original page URL. Useful after a sidecar import. Videos are not redownloaded — only the thumbnail URL is refreshed.
            </p>
            <div className="flex flex-wrap gap-2 items-center">
              <Button variant="secondary" onClick={() => handleRefreshThumbnails(false)} disabled={thumbsLoading}>
                {thumbsLoading ? 'Queuing...' : 'Refresh missing thumbnails'}
              </Button>
              <Button variant="secondary" onClick={() => handleRefreshThumbnails(true)} disabled={thumbsLoading}>
                Refresh all thumbnails
              </Button>
              {thumbsStatus && (
                <span className="text-sm font-medium" style={{ color: theme.accent }}>{thumbsStatus}</span>
              )}
            </div>
          </div>
        </Surface>
      </div>

      <ConfirmDialog
        open={importSidecarConfirmOpen}
        title="Import from sidecars"
        message="Scan the videos folder for sidecar JSON files and import them? Existing rows that conflict (same id or page URL) will be replaced from the sidecar."
        confirmLabel="Import"
        onConfirm={runImportSidecars}
        onClose={() => setImportSidecarConfirmOpen(false)}
      />

      {browse && (
        <FolderPicker
          onSelect={path => {
            if (browse === 'download') setDownloadPath(path)
            else setFfmpegPath(path)
            setBrowse(null)
          }}
          onClose={() => setBrowse(null)}
        />
      )}
    </>
  )
}
