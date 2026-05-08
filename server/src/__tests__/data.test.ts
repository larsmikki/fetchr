import supertest from 'supertest'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createApp } from '../app.js'
import { resetDb } from '../db/connection.js'
import { runMigrations } from '../db/migrate.js'

vi.mock('../services/extractor.service.js', () => ({
  extractVideoInfo: vi.fn().mockResolvedValue({
    title: 'Mock Title',
    description: null,
    duration: 60,
    thumbnail_url: null,
    stream_url: null,
    site: 'example',
  }),
  getStreamUrl: vi.fn().mockResolvedValue('https://example.com/stream.mp4'),
  downloadToPath: vi.fn().mockResolvedValue('/tmp/reely-test/videos/1.mp4'),
  downloadMp3ToPath: vi.fn().mockResolvedValue(undefined),
}))

const app = createApp()

beforeEach(async () => {
  await resetDb()
  runMigrations()
})

describe('GET /api/data/export', () => {
  it('returns empty export when no data exists', async () => {
    const res = await supertest(app).get('/api/data/export')
    expect(res.status).toBe(200)
    expect(res.body.version).toBe(1)
    expect(res.body.collections).toEqual([])
    expect(res.body.videos).toEqual([])
    expect(res.body.exported_at).toBeDefined()
  })

  it('exports existing collections and videos', async () => {
    await supertest(app).post('/api/collections').send({ name: 'Favorites', color: '#e11d48' })
    await supertest(app).post('/api/videos').send({ url: 'https://example.com/v', notes: 'great' })

    const res = await supertest(app).get('/api/data/export')
    expect(res.body.collections).toHaveLength(1)
    expect(res.body.collections[0].name).toBe('Favorites')
    expect(res.body.videos).toHaveLength(1)
    expect(res.body.videos[0].page_url).toBe('https://example.com/v')
    expect(res.body.videos[0].notes).toBe('great')
  })
})

describe('POST /api/data/import', () => {
  it('imports collections and videos', async () => {
    const payload = {
      version: 1,
      collections: [{ name: 'Imported', color: '#0000ff', sort_order: 0, desktop_id: 1 }],
      videos: [{ page_url: 'https://imported.com/v', title: 'Imported Video', desktop_id: 1, collection_name: 'Imported' }],
    }

    const res = await supertest(app).post('/api/data/import').send(payload)
    expect(res.status).toBe(200)
    expect(res.body.imported).toBe(1)

    const collections = await supertest(app).get('/api/collections')
    expect(collections.body.items[0].name).toBe('Imported')

    const videos = await supertest(app).get('/api/videos')
    expect(videos.body.items[0].title).toBe('Imported Video')
    expect(videos.body.items[0].collection_id).toBeTypeOf('number')
  })

  it('skips videos with duplicate URLs', async () => {
    const payload = {
      version: 1,
      collections: [],
      videos: [{ page_url: 'https://example.com/v', desktop_id: 1 }],
    }
    await supertest(app).post('/api/data/import').send(payload)
    const res = await supertest(app).post('/api/data/import').send(payload)
    expect(res.body.imported).toBe(0)

    const videos = await supertest(app).get('/api/videos')
    expect(videos.body.total).toBe(1)
  })

  it('returns 400 for invalid payload', async () => {
    const res = await supertest(app).post('/api/data/import').send({ version: 2, collections: [] })
    expect(res.status).toBe(400)
  })

  it('export → import is idempotent', async () => {
    await supertest(app).post('/api/collections').send({ name: 'Test' })
    await supertest(app).post('/api/videos').send({ url: 'https://example.com/v' })

    const exported = await supertest(app).get('/api/data/export')
    const importRes = await supertest(app).post('/api/data/import').send(exported.body)
    expect(importRes.body.imported).toBe(0)
  })
})

describe('GET /api/data/videos.zip', () => {
  it('returns 404 when no videos have a local file', async () => {
    await supertest(app).post('/api/videos').send({ url: 'https://example.com/v' })
    const res = await supertest(app).get('/api/data/videos.zip')
    expect(res.status).toBe(404)
  })

  it('returns 404 on empty library', async () => {
    const res = await supertest(app).get('/api/data/videos.zip')
    expect(res.status).toBe(404)
  })
})
