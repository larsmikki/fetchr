import supertest from 'supertest'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createApp } from '../app.js'
import { resetDb } from '../db/connection.js'
import { runMigrations } from '../db/migrate.js'
import { jobsRepo } from '../db/repositories/jobs.js'
import { drainJobsForTest } from '../services/jobs.service.js'
import { videosRepo } from '../db/repositories/videos.js'

vi.mock('../services/extractor.service.js', () => ({
  extractVideoInfo: vi.fn().mockResolvedValue({
    title: 'Job Mock',
    description: null,
    duration: 90,
    thumbnail_url: null,
    stream_url: null,
    site: 'example',
  }),
  getStreamUrl: vi.fn().mockResolvedValue('https://example.com/stream.mp4'),
  downloadToPath: vi.fn().mockResolvedValue('/tmp/reely-test/videos/mock.mp4'),
  downloadMp3ToPath: vi.fn().mockResolvedValue(undefined),
}))

const app = createApp()

beforeEach(async () => {
  await resetDb()
  runMigrations()
})

describe('GET /api/jobs', () => {
  it('returns the active jobs queue', async () => {
    await supertest(app).post('/api/videos').send({ url: 'https://example.com/v' })
    const res = await supertest(app).get('/api/jobs')
    expect(res.status).toBe(200)
    expect(res.body.items.length).toBeGreaterThan(0)
    expect(res.body.items[0].kind).toBe('extract_metadata')
  })

  it('filters by video_id', async () => {
    const v1 = await supertest(app).post('/api/videos').send({ url: 'https://example.com/v1' })
    await supertest(app).post('/api/videos').send({ url: 'https://example.com/v2' })

    const res = await supertest(app).get(`/api/jobs?video_id=${v1.body.id}`)
    expect(res.status).toBe(200)
    expect(res.body.items.every((j: { video_id: number }) => j.video_id === v1.body.id)).toBe(true)
  })
})

describe('POST /api/jobs/:id/cancel', () => {
  it('cancels a pending job', async () => {
    await supertest(app).post('/api/videos').send({ url: 'https://example.com/v' })
    const list = await supertest(app).get('/api/jobs')
    const jobId = list.body.items[0].id
    const res = await supertest(app).post(`/api/jobs/${jobId}/cancel`)
    expect(res.status).toBe(200)
    expect(jobsRepo.findById(jobId)?.status).toBe('cancelled')
  })

  it('returns 404 for non-existent jobs', async () => {
    const res = await supertest(app).post('/api/jobs/9999/cancel')
    expect(res.status).toBe(404)
  })
})

describe('POST /api/jobs/:id/retry', () => {
  it('requeues a failed job', async () => {
    const job = jobsRepo.enqueue({ videoId: null, kind: 'extract_metadata' })
    jobsRepo.claimNext()
    jobsRepo.markFailed(job.id, 'boom', false)
    expect(jobsRepo.findById(job.id)?.status).toBe('error')

    const res = await supertest(app).post(`/api/jobs/${job.id}/retry`)
    expect(res.status).toBe(200)
    const active = jobsRepo.listActive()
    expect(active.some(j => j.kind === 'extract_metadata' && j.status === 'pending')).toBe(true)
  })

  it('returns 409 when the job is still active', async () => {
    const job = jobsRepo.enqueue({ videoId: null, kind: 'extract_metadata' })
    const res = await supertest(app).post(`/api/jobs/${job.id}/retry`)
    expect(res.status).toBe(409)
  })
})

describe('worker drainJobsForTest', () => {
  it('processes the extract_metadata + download_video chain end-to-end', async () => {
    const created = await supertest(app).post('/api/videos').send({ url: 'https://example.com/v' })
    expect(created.body.fetch_status).toBe('pending')

    await drainJobsForTest()

    const updated = videosRepo.findById(created.body.id)!
    expect(updated.fetch_status).toBe('ok')
    expect(updated.title).toBe('Job Mock')
    expect(updated.local_path).toBe('/tmp/reely-test/videos/mock.mp4')
  })
})
