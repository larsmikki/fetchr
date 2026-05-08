import supertest from 'supertest'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createApp } from '../app.js'
import { resetDb } from '../db/connection.js'
import { runMigrations } from '../db/migrate.js'

vi.mock('../services/extractor.service.js', () => ({
  extractVideoInfo: vi.fn().mockResolvedValue({
    title: 'Mock Title',
    description: 'Mock description',
    duration: 120,
    thumbnail_url: 'https://example.com/thumb.jpg',
    stream_url: 'https://example.com/stream.mp4',
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

describe('GET /api/videos', () => {
  it('returns empty paginated list', async () => {
    const res = await supertest(app).get('/api/videos')
    expect(res.status).toBe(200)
    expect(res.body.items).toEqual([])
    expect(res.body.total).toBe(0)
    expect(res.body.page).toBe(1)
    expect(res.body.totalPages).toBe(0)
  })

  it('paginates results', async () => {
    for (let i = 0; i < 5; i++) {
      await supertest(app).post('/api/videos').send({ url: `https://example.com/video/${i}` })
    }
    const res = await supertest(app).get('/api/videos?limit=2&page=1')
    expect(res.body.items).toHaveLength(2)
    expect(res.body.total).toBe(5)
    expect(res.body.totalPages).toBe(3)
  })

  it('filters by collection_id', async () => {
    const col = await supertest(app).post('/api/collections').send({ name: 'C' })
    const v1 = await supertest(app).post('/api/videos').send({ url: 'https://example.com/a' })
    await supertest(app).post('/api/videos').send({ url: 'https://example.com/b' })
    await supertest(app).put(`/api/videos/${v1.body.id}`).send({ collection_id: col.body.id })

    const res = await supertest(app).get(`/api/videos?collection_id=${col.body.id}`)
    expect(res.body.total).toBe(1)
    expect(res.body.items[0].id).toBe(v1.body.id)
  })

  it('searches by title and notes', async () => {
    const v = await supertest(app).post('/api/videos').send({ url: 'https://example.com/a' })
    await supertest(app).put(`/api/videos/${v.body.id}`).send({ title: 'Holiday Vlog', notes: 'summer' })
    await supertest(app).post('/api/videos').send({ url: 'https://example.com/b' })

    const res = await supertest(app).get('/api/videos?q=holiday')
    expect(res.body.total).toBe(1)
    expect(res.body.items[0].id).toBe(v.body.id)
  })
})

describe('POST /api/videos', () => {
  it('creates a video with pending status', async () => {
    const res = await supertest(app)
      .post('/api/videos')
      .send({ url: 'https://youtube.com/watch?v=abc123' })
    expect(res.status).toBe(201)
    expect(res.body.page_url).toBe('https://youtube.com/watch?v=abc123')
    expect(res.body.fetch_status).toBe('pending')
    expect(res.body.id).toBeTypeOf('number')
  })

  it('returns 400 if url is missing', async () => {
    const res = await supertest(app).post('/api/videos').send({ notes: 'no url' })
    expect(res.status).toBe(400)
  })

  it('returns 409 on duplicate URL for same desktop', async () => {
    await supertest(app).post('/api/videos').send({ url: 'https://example.com/v' })
    const res = await supertest(app).post('/api/videos').send({ url: 'https://example.com/v' })
    expect(res.status).toBe(409)
  })

  it('allows the same URL on a different desktop', async () => {
    await supertest(app).post('/api/videos').send({ url: 'https://example.com/v', desktop_id: 1 })
    const res = await supertest(app).post('/api/videos').send({ url: 'https://example.com/v', desktop_id: 2 })
    expect(res.status).toBe(201)
  })
})

describe('GET /api/videos/:id', () => {
  it('returns the video', async () => {
    const created = await supertest(app).post('/api/videos').send({ url: 'https://example.com/v' })
    const res = await supertest(app).get(`/api/videos/${created.body.id}`)
    expect(res.status).toBe(200)
    expect(res.body.page_url).toBe('https://example.com/v')
  })

  it('returns 404 for non-existent video', async () => {
    const res = await supertest(app).get('/api/videos/9999')
    expect(res.status).toBe(404)
  })
})

describe('PUT /api/videos/:id', () => {
  it('updates title and notes', async () => {
    const created = await supertest(app).post('/api/videos').send({ url: 'https://example.com/v' })
    const res = await supertest(app)
      .put(`/api/videos/${created.body.id}`)
      .send({ title: 'My Title', notes: 'Some notes' })
    expect(res.status).toBe(200)
    expect(res.body.title).toBe('My Title')
    expect(res.body.notes).toBe('Some notes')
  })

  it('assigns a collection', async () => {
    const col = await supertest(app).post('/api/collections').send({ name: 'Favorites' })
    const vid = await supertest(app).post('/api/videos').send({ url: 'https://example.com/v' })
    const res = await supertest(app)
      .put(`/api/videos/${vid.body.id}`)
      .send({ collection_id: col.body.id })
    expect(res.status).toBe(200)
    expect(res.body.collection_id).toBe(col.body.id)
  })

  it('returns 404 for non-existent video', async () => {
    const res = await supertest(app).put('/api/videos/9999').send({ title: 'Ghost' })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/videos/:id', () => {
  it('deletes a video', async () => {
    const created = await supertest(app).post('/api/videos').send({ url: 'https://example.com/v' })
    const id = created.body.id

    expect((await supertest(app).delete(`/api/videos/${id}`)).status).toBe(200)
    expect((await supertest(app).get(`/api/videos/${id}`)).status).toBe(404)
  })

  it('removes an empty collection when its last video is deleted', async () => {
    const col = await supertest(app).post('/api/collections').send({ name: 'Solo' })
    const vid = await supertest(app).post('/api/videos').send({ url: 'https://example.com/v' })
    await supertest(app).put(`/api/videos/${vid.body.id}`).send({ collection_id: col.body.id })

    await supertest(app).delete(`/api/videos/${vid.body.id}`)

    const collections = await supertest(app).get('/api/collections')
    expect(collections.body.items.find((c: { id: number }) => c.id === col.body.id)).toBeUndefined()
  })

  it('does not remove a collection that still has other videos', async () => {
    const col = await supertest(app).post('/api/collections').send({ name: 'HasVideos' })
    const v1 = await supertest(app).post('/api/videos').send({ url: 'https://example.com/a' })
    const v2 = await supertest(app).post('/api/videos').send({ url: 'https://example.com/b' })
    await supertest(app).put(`/api/videos/${v1.body.id}`).send({ collection_id: col.body.id })
    await supertest(app).put(`/api/videos/${v2.body.id}`).send({ collection_id: col.body.id })

    await supertest(app).delete(`/api/videos/${v1.body.id}`)

    const collections = await supertest(app).get('/api/collections')
    expect(collections.body.items.find((c: { id: number }) => c.id === col.body.id)).toBeDefined()
  })

  it('returns 404 for non-existent video', async () => {
    const res = await supertest(app).delete('/api/videos/9999')
    expect(res.status).toBe(404)
  })
})

describe('collection auto-prune on reassignment', () => {
  it('removes old collection when its last video is moved to another', async () => {
    const old = await supertest(app).post('/api/collections').send({ name: 'Old' })
    const newCol = await supertest(app).post('/api/collections').send({ name: 'New' })
    const vid = await supertest(app).post('/api/videos').send({ url: 'https://example.com/v' })
    await supertest(app).put(`/api/videos/${vid.body.id}`).send({ collection_id: old.body.id })

    await supertest(app).put(`/api/videos/${vid.body.id}`).send({ collection_id: newCol.body.id })

    const collections = await supertest(app).get('/api/collections')
    const names = collections.body.items.map((c: { name: string }) => c.name)
    expect(names).not.toContain('Old')
    expect(names).toContain('New')
  })

  it('removes old collection when its last video is uncategorized', async () => {
    const col = await supertest(app).post('/api/collections').send({ name: 'Temp' })
    const vid = await supertest(app).post('/api/videos').send({ url: 'https://example.com/v' })
    await supertest(app).put(`/api/videos/${vid.body.id}`).send({ collection_id: col.body.id })

    await supertest(app).put(`/api/videos/${vid.body.id}`).send({ collection_id: null })

    const collections = await supertest(app).get('/api/collections')
    expect(collections.body.items.find((c: { id: number }) => c.id === col.body.id)).toBeUndefined()
  })
})

describe('POST /api/videos/:id/refresh', () => {
  it('refreshes video metadata and sets status to ok', async () => {
    const created = await supertest(app).post('/api/videos').send({ url: 'https://example.com/v' })
    const res = await supertest(app).post(`/api/videos/${created.body.id}/refresh`)
    expect(res.status).toBe(200)
    expect(res.body.fetch_status).toBe('ok')
    expect(res.body.title).toBe('Mock Title')
    expect(res.body.duration).toBe(120)
  })

  it('returns 404 for non-existent video', async () => {
    const res = await supertest(app).post('/api/videos/9999/refresh')
    expect(res.status).toBe(404)
  })
})

describe('POST /api/videos/:id/redownload', () => {
  it('returns 202 and triggers background download', async () => {
    const created = await supertest(app).post('/api/videos').send({ url: 'https://example.com/v' })
    const res = await supertest(app).post(`/api/videos/${created.body.id}/redownload`)
    expect(res.status).toBe(202)
    expect(res.body.ok).toBe(true)
  })

  it('returns 404 for non-existent video', async () => {
    const res = await supertest(app).post('/api/videos/9999/redownload')
    expect(res.status).toBe(404)
  })
})
