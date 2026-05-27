import { useState, useEffect } from 'react'
import { getSettings } from '@/api'

export function useDownloadPath(): string | null {
  const [downloadPath, setDownloadPath] = useState<string | null>(null)
  useEffect(() => {
    getSettings().then(s => setDownloadPath(s.download_path ?? null)).catch(() => {})
  }, [])
  return downloadPath
}
