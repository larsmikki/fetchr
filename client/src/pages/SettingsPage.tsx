import { useState, useEffect, useRef } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import ThemePicker from '@/components/ThemePicker'
import FolderPicker from '@/components/FolderPicker'
import { getSettings, updateSettings, exportData, importData, downloadAllVideos } from '@/api/client'

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
    } catch {
      // ignore
    } finally {
      setDownloadPathLoading(false)
    }
  }

  const saveFfmpegPath = async (e: React.FormEvent) => {
    e.preventDefault()
    setFfmpegPathLoading(true)
    try {
      await updateSettings({ ffmpeg_path: ffmpegPath })
      setFfmpegPathSaved(true)
      setTimeout(() => setFfmpegPathSaved(false), 2000)
    } catch {
      // ignore
    } finally {
      setFfmpegPathLoading(false)
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

  const sectionStyle = {
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: '16px',
    padding: '24px',
    marginBottom: '20px',
  }

  const btnStyle = {
    background: 'linear-gradient(135deg, #e11d48 0%, #9f1239 100%)',
  }

  return (
    <>
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: theme.text }}>
          Settings
        </h1>
        <p className="text-sm mt-0.5" style={{ color: theme.text2 }}>
          Customize your Reely experience.
        </p>
      </div>

      {/* Themes */}
      <div style={sectionStyle}>
        <h2 className="text-base font-bold mb-1" style={{ color: theme.text }}>
          Themes
        </h2>
        <p className="text-sm mb-4" style={{ color: theme.text2 }}>
          Choose a color theme for the interface.
        </p>
        <ThemePicker />
      </div>

      {/* Downloads */}
      <div style={sectionStyle}>
        <h2 className="text-base font-bold mb-1" style={{ color: theme.text }}>
          Downloads
        </h2>
        <p className="text-sm mb-4" style={{ color: theme.text2 }}>
          When set, newly added videos are automatically downloaded to this folder using yt-dlp.
          Supports local paths and network shares (e.g. <code style={{ color: theme.accent }}>\\server\share\videos</code>).
        </p>
        <form onSubmit={saveDownloadPath} className="flex items-center gap-3">
          <input
            type="text"
            value={downloadPath}
            onChange={e => setDownloadPath(e.target.value)}
            placeholder="e.g. C:\Videos or \\nas\media\videos"
            className="flex-1 px-3 py-2.5 rounded-lg text-sm outline-none"
            style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.text }}
          />
          <button
            type="button"
            onClick={() => setBrowse('download')}
            className="px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap"
            style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.text }}
          >
            Browse
          </button>
          <button
            type="submit"
            disabled={downloadPathLoading}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 whitespace-nowrap"
            style={btnStyle}
          >
            {downloadPathLoading ? 'Saving...' : 'Save'}
          </button>
          {downloadPathSaved && (
            <span className="text-sm font-medium" style={{ color: theme.accent }}>Saved</span>
          )}
        </form>

        <p className="text-sm mt-4 mb-2" style={{ color: theme.text2 }}>
          ffmpeg path override for MP3 downloads. Leave blank to use the bundled ffmpeg.
        </p>
        <form onSubmit={saveFfmpegPath} className="flex items-center gap-3">
          <input
            type="text"
            value={ffmpegPath}
            onChange={e => setFfmpegPath(e.target.value)}
            placeholder="e.g. C:\ffmpeg\bin"
            className="flex-1 px-3 py-2.5 rounded-lg text-sm outline-none"
            style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.text }}
          />
          <button
            type="button"
            onClick={() => setBrowse('ffmpeg')}
            className="px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap"
            style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.text }}
          >
            Browse
          </button>
          <button
            type="submit"
            disabled={ffmpegPathLoading}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 whitespace-nowrap"
            style={btnStyle}
          >
            {ffmpegPathLoading ? 'Saving...' : 'Save'}
          </button>
          {ffmpegPathSaved && (
            <span className="text-sm font-medium" style={{ color: theme.accent }}>Saved</span>
          )}
        </form>
      </div>

      {/* App Data */}
      <div style={sectionStyle}>
        <h2 className="text-base font-bold mb-1" style={{ color: theme.text }}>
          App Data
        </h2>
        <p className="text-sm mb-4" style={{ color: theme.text2 }}>
          Export all your video URLs and collections as a JSON backup. Import restores them without triggering downloads — you can download each video manually afterwards.
        </p>
        <div className="flex gap-3">
          <button
            onClick={exportData}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl transition-all hover:opacity-80"
            style={{ background: theme.surface2, color: theme.text, border: `1px solid ${theme.border}` }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            Export Settings
          </button>
          <button
            onClick={() => importRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl transition-all hover:opacity-80"
            style={{ background: theme.surface2, color: theme.text, border: `1px solid ${theme.border}` }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
            Import Settings
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleImport}
          />
          {importStatus && (
            <span className="text-sm font-medium" style={{ color: theme.accent }}>
              {importStatus}
            </span>
          )}
        </div>

        <div
          className="mt-4 pt-4"
          style={{ borderTop: `1px solid ${theme.border}` }}
        >
          <p className="text-sm mb-3" style={{ color: theme.text2 }}>
            Download all locally saved videos as a ZIP file. Large collections may take a while to package.
          </p>
          <button
            onClick={downloadAllVideos}
            className="px-4 py-2 rounded-lg text-sm font-semibold"
            style={{
              background: theme.surface2,
              border: `1px solid ${theme.border}`,
              color: theme.text,
            }}
          >
            Download all videos
          </button>
        </div>
      </div>
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
