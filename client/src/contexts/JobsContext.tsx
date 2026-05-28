import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

export type JobKind = 'extract_metadata' | 'download_video' | 'download_mp3' | 'copy_to_output' | 'fetch_thumbnail'
export type JobStatus = 'pending' | 'running' | 'ok' | 'error' | 'cancelled' | 'ignored'

export interface Job {
  id: number
  video_id: number | null
  kind: JobKind
  status: JobStatus
  progress: number
  error: string | null
  attempts: number
  max_attempts: number
  updated_at: string
}

interface JobsContextValue {
  jobs: Job[]
  jobsByVideoId: Map<number, Job[]>
}

const JobsContext = createContext<JobsContextValue>({ jobs: [], jobsByVideoId: new Map() })

const ACTIVE_STATES = new Set<JobStatus>(['pending', 'running'])

export function JobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Map<number, Job>>(new Map())

  useEffect(() => {
    let cancelled = false
    let source: EventSource | null = null

    const handle = (job: Job) => {
      if (cancelled) return
      setJobs(prev => {
        const next = new Map(prev)
        // Keep active jobs and recently-completed ones for ~10s
        if (ACTIVE_STATES.has(job.status)) {
          next.set(job.id, job)
        } else {
          next.set(job.id, job)
          setTimeout(() => {
            setJobs(p => {
              if (p.get(job.id)?.updated_at !== job.updated_at) return p
              const m = new Map(p)
              m.delete(job.id)
              return m
            })
          }, 10000)
        }
        return next
      })
    }

    try {
      source = new EventSource('/api/jobs/stream')
      source.addEventListener('snapshot', e => {
        try { handle(JSON.parse((e as MessageEvent).data) as Job) } catch {}
      })
      source.addEventListener('change', e => {
        try { handle(JSON.parse((e as MessageEvent).data) as Job) } catch {}
      })
      source.onerror = () => {
        // EventSource auto-reconnects; nothing to do here
      }
    } catch {
      // SSE not supported — silently no-op
    }

    return () => {
      cancelled = true
      source?.close()
    }
  }, [])

  const value = useMemo<JobsContextValue>(() => {
    const list = Array.from(jobs.values())
    const byVideo = new Map<number, Job[]>()
    for (const job of list) {
      if (job.video_id == null) continue
      const arr = byVideo.get(job.video_id) ?? []
      arr.push(job)
      byVideo.set(job.video_id, arr)
    }
    return { jobs: list, jobsByVideoId: byVideo }
  }, [jobs])

  return <JobsContext.Provider value={value}>{children}</JobsContext.Provider>
}

export function useJobs() { return useContext(JobsContext) }

export function useVideoJobs(videoId: number): Job[] {
  const { jobsByVideoId } = useJobs()
  return jobsByVideoId.get(videoId) ?? []
}

export function useActiveVideoJob(videoId: number): Job | null {
  const jobs = useVideoJobs(videoId)
  const active = jobs.find(j => ACTIVE_STATES.has(j.status))
  return active ?? null
}

export const JOB_KIND_LABEL: Record<JobKind, string> = {
  extract_metadata: 'Fetching info…',
  download_video: 'Downloading…',
  download_mp3: 'Exporting MP3…',
  copy_to_output: 'Copying file…',
  fetch_thumbnail: 'Fetching thumbnail…',
}
