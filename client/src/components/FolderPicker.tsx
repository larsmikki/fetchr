import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTheme } from '@/contexts/ThemeContext'

interface BrowseEntry { name: string; path: string }
interface BrowseResult {
  path: string
  parent: string | null
  entries: BrowseEntry[]
  breadcrumbs: Array<{ label: string; path: string }>
}

interface Props {
  onSelect: (path: string) => void
  onClose: () => void
}

export default function FolderPicker({ onSelect, onClose }: Props) {
  const { theme } = useTheme()
  const [path, setPath] = useState<string | undefined>()

  const { data: result = null, isLoading: loading, error } = useQuery({
    queryKey: ['folder-picker', path],
    queryFn: async () => {
      const url = path ? `/api/browse?path=${encodeURIComponent(path)}` : '/api/browse'
      const res = await fetch(url)
      const data = await res.json() as BrowseResult & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to load')
      return data
    },
  })
  const navigate = (nextPath?: string) => setPath(nextPath)

  const inputStyle = {
    background: theme.surface2,
    border: `1px solid ${theme.border}`,
    color: theme.text,
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}
      onClick={onClose}
    >
      <div
        style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, width: 480, maxWidth: '90vw', display: 'flex', flexDirection: 'column', maxHeight: '70vh', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: `1px solid ${theme.border}` }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: theme.text }}>Select Folder</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.text2, padding: 4, display: 'flex' }}>
            <svg width={16} height={16} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Breadcrumbs */}
        <div style={{ padding: '8px 20px', borderBottom: `1px solid ${theme.border}`, display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center', minHeight: 40, ...inputStyle }}>
          {result?.breadcrumbs.map((crumb, i) => (
            <span key={crumb.path} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {i > 0 && <span style={{ color: theme.text2, fontSize: 11, userSelect: 'none' }}>›</span>}
              <button
                onClick={() => navigate(crumb.path)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 3px', fontSize: 12, fontWeight: i === result.breadcrumbs.length - 1 ? 700 : 400, color: i === result.breadcrumbs.length - 1 ? theme.text : theme.accent }}
              >
                {crumb.label}
              </button>
            </span>
          ))}
        </div>

        {/* Directory list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: theme.text2, fontSize: 14 }}>Loading…</div>
          )}
          {error && (
            <div style={{ padding: '16px 20px', color: '#ef4444', fontSize: 13 }}>
              {error instanceof Error ? error.message : 'Failed to load directory'}
            </div>
          )}
          {!loading && !error && result?.entries.length === 0 && (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: theme.text2, fontSize: 13 }}>No subfolders</div>
          )}
          {!loading && result?.entries.map(entry => (
            <button
              key={entry.path}
              onClick={() => navigate(entry.path)}
              className="w-full flex items-center gap-2.5 px-5 py-2 text-left text-sm transition-colors"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.text }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = theme.surface2 }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
            >
              <svg width={15} height={15} fill={theme.accent} viewBox="0 0 20 20" style={{ flexShrink: 0 }}>
                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
              </svg>
              {entry.name}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ flex: 1, fontSize: 12, color: theme.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {result?.path ?? ''}
          </span>
          <button
            onClick={() => result && onSelect(result.path)}
            disabled={!result}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 whitespace-nowrap"
            style={{ background: 'linear-gradient(135deg, #e11d48 0%, #9f1239 100%)', border: 'none', cursor: 'pointer' }}
          >
            Select
          </button>
        </div>
      </div>
    </div>
  )
}
