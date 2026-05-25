import { useTheme } from '@/contexts/ThemeContext'

interface Props {
  outputDir: string
  outputMp3: boolean
  outputMp4: boolean
  onMp3Change: (v: boolean) => void
  onMp4Change: (v: boolean) => void
}

export function OutputOptions({ outputDir, outputMp3, outputMp4, onMp3Change, onMp4Change }: Props) {
  const { theme } = useTheme()
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold tracking-wide" style={{ color: theme.text2 }}>Output folder</span>
        <span className="text-xs font-mono truncate max-w-48" style={{ color: theme.text2 }} title={outputDir}>{outputDir}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Toggle label="Output Audio" active={outputMp3} onChange={onMp3Change} icon={<AudioIcon />} />
        <Toggle label="Output Video" active={outputMp4} onChange={onMp4Change} icon={<VideoIcon />} />
      </div>
    </div>
  )
}

function Toggle({ label, active, onChange, icon }: { label: string; active: boolean; onChange: (v: boolean) => void; icon: React.ReactNode }) {
  const { theme } = useTheme()
  return (
    <label
      className="flex items-center gap-2.5 p-3 rounded-xl cursor-pointer transition-all border"
      style={{
        background: active ? theme.surface2 : theme.surface,
        borderColor: active ? theme.accent : theme.border,
        color: theme.text,
      }}
    >
      <div
        className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 transition-colors"
        style={{ background: active ? theme.accent : theme.surface2, color: active ? 'white' : theme.text2 }}
      >
        {icon}
      </div>
      <span className="text-sm font-semibold leading-tight">{label}</span>
      <input type="checkbox" className="hidden" checked={active} onChange={e => onChange(e.target.checked)} />
    </label>
  )
}

function AudioIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path fillRule="evenodd" clipRule="evenodd" d="M10 1C9.73478 1 9.48043 1.10536 9.29289 1.29289L3.29289 7.29289C3.10536 7.48043 3 7.73478 3 8V20C3 21.6569 4.34315 23 6 23H7C7.55228 23 8 22.5523 8 22C8 21.4477 7.55228 21 7 21H6C5.44772 21 5 20.5523 5 20V9H10C10.5523 9 11 8.55228 11 8V3H18C18.5523 3 19 3.44772 19 4V7C19 7.55228 19.4477 8 20 8C20.5523 8 21 7.55228 21 7V4C21 2.34315 19.6569 1 18 1H10ZM9 7H6.41421L9 4.41421V7ZM12.5 24C13.8807 24 15 22.8807 15 21.5V12.8673L20 12.153V18.05C19.8384 18.0172 19.6712 18 19.5 18C18.1193 18 17 19.1193 17 20.5C17 21.8807 18.1193 23 19.5 23C20.8807 23 22 21.8807 22 20.5V11C22 10.7101 21.8742 10.4345 21.6552 10.2445C21.4362 10.0546 21.1456 9.96905 20.8586 10.0101L13.8586 11.0101C13.3659 11.0804 13 11.5023 13 12V19.05C12.8384 19.0172 12.6712 19 12.5 19C11.1193 19 10 20.1193 10 21.5C10 22.8807 11.1193 24 12.5 24Z" />
    </svg>
  )
}

function VideoIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M19.5617 7C19.7904 5.69523 18.7863 4.5 17.4617 4.5H6.53788C5.21323 4.5 4.20922 5.69523 4.43784 7" />
      <path d="M17.4999 4.5C17.5283 4.24092 17.5425 4.11135 17.5427 4.00435C17.545 2.98072 16.7739 2.12064 15.7561 2.01142C15.6497 2 15.5194 2 15.2588 2H8.74099C8.48035 2 8.35002 2 8.24362 2.01142C7.22584 2.12064 6.45481 2.98072 6.45704 4.00434C6.45727 4.11135 6.47146 4.2409 6.49983 4.5" />
      <path d="M14.5812 13.6159C15.1396 13.9621 15.1396 14.8582 14.5812 15.2044L11.2096 17.2945C10.6669 17.6309 10 17.1931 10 16.5003L10 12.32C10 11.6273 10.6669 11.1894 11.2096 11.5258L14.5812 13.6159Z" />
      <path d="M2.38351 13.793C1.93748 10.6294 1.71447 9.04765 2.66232 8.02383C3.61017 7 5.29758 7 8.67239 7H15.3276C18.7024 7 20.3898 7 21.3377 8.02383C22.2855 9.04765 22.0625 10.6294 21.6165 13.793L21.1935 16.793C20.8437 19.2739 20.6689 20.5143 19.7717 21.2572C18.8745 22 17.5512 22 14.9046 22H9.09536C6.44881 22 5.12553 22 4.22834 21.2572C3.33115 20.5143 3.15626 19.2739 2.80648 16.793L2.38351 13.793Z" />
    </svg>
  )
}
