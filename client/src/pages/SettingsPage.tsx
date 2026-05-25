import { useState, useEffect, useRef } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import ThemePicker from '@/components/ThemePicker'
import FolderPicker from '@/components/FolderPicker'
import { getSettings, updateSettings, exportData, importData, downloadAllVideos, regenerateSidecars, cancelJob, retryJob, cleanupAndRetryVideo } from '@/api/client'
import { Button, Input, Surface } from '@/components/ui'
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
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, force] = useState(0)

  // Re-render once a second so the "age" column ticks for stuck jobs
  useEffect(() => {
    const t = setInterval(() => force(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const sorted = [...jobs].sort((a, b) => a.id - b.id)

  const handleCancel = async (job: Job) => {
    setBusyId(job.id)
    setError(null)
    try { await cancelJob(job.id) }
    catch (e) { setError(e instanceof Error ? e.message : 'Cancel failed') }
    finally { setBusyId(null) }
  }

  const handleRetry = async (job: Job) => {
    setBusyId(job.id)
    setError(null)
    try { await retryJob(job.id) }
    catch (e) { setError(e instanceof Error ? e.message : 'Retry failed') }
    finally { setBusyId(null) }
  }

  const handleCleanupRetry = async (job: Job) => {
    if (job.video_id == null) return
    if (!confirm('Cancel all jobs for this video, delete any partial files, and restart the download from scratch?')) return
    setBusyId(job.id)
    setError(null)
    try { await cleanupAndRetryVideo(job.video_id) }
    catch (e) { setError(e instanceof Error ? e.message : 'Cleanup failed') }
    finally { setBusyId(null) }
  }

  return (
    <Surface className="p-6 mb-5">
      <h2 className="text-base font-bold mb-1" style={{ color: theme.text }}>Job queue</h2>
      <p className="text-xs mb-5" style={{ color: theme.text2 }}>
        Active and recent jobs. Cancel any download that appears stuck to unblock the queue.
      </p>

      {sorted.length === 0 ? (
        <p className="text-sm" style={{ color: theme.text2 }}>No active jobs.</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map(job => {
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
                    <p className="text-xs mt-1 truncate" style={{ color: theme.text2 }} title={job.error}>
                      {job.error}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  {canCancel && (
                    <Button variant="secondary" onClick={() => handleCancel(job)} disabled={busyId === job.id}>
                      Cancel
                    </Button>
                  )}
                  {canRetry && (
                    <Button variant="secondary" onClick={() => handleRetry(job)} disabled={busyId === job.id}>
                      Retry
                    </Button>
                  )}
                  {job.video_id != null && (
                    <Button variant="secondary" onClick={() => handleCleanupRetry(job)} disabled={busyId === job.id}>
                      Clean & retry
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
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const [browse, setBrowse] = useState<'download' | 'ffmpeg' | null>(null)
  const [sidecarStatus, setSidecarStatus] = useState<string | null>(null)
  const [sidecarLoading, setSidecarLoading] = useState(false)

  useEffect(() => {
    getSettings().then(s => {
      if (s.download_path) setDownloadPath(s.download_path)
      if (s.ffmpeg_path) setFfmpegPath(s.ffmpeg_path)
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
          <p className="text-sm mt-0.5" style={{ color: theme.text2 }}>Customize your Reely experience.</p>
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

          <div className="mt-5 pt-5" style={{ borderTop: `1px solid ${theme.border}` }}>
            <p className="text-xs mb-3" style={{ color: theme.text2 }}>
              Write a JSON sidecar (title, site, collection, page URL) next to every locally downloaded video. Sidecars are kept up to date automatically — run this once to backfill the existing library.
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
        </Surface>
      </div>

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
