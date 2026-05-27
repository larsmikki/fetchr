import supertest from 'supertest'
import { describe, it, expect, beforeEach } from 'vitest'
import { createApp } from '../src/app.js'
import { resetDb } from '../src/db/connection.js'
import { runMigrations } from '../src/db/migrate.js'

const app = createApp()

beforeEach(async () => {
  await resetDb()
  runMigrations()
})

describe('GET /api/collections', () => {
  it('returns empty list initially', async () => {
    const res = await supertest(app).get('/api/collections')
    expect(res.status).toBe(200)
    expect(res.body.items).toEqual([])
    expect(res.body.totalVideoCount).toBe(0)
    expect(res.body.uncategorizedCount).toBe(0)
  })

  it('filters by desktop', async () => {
    await supertest(app).post('/api/collections').send({ name: 'Desk1', desktop_id: 1 })
    await supertest(app).post('/api/collections').send({ name: 'Desk2', desktop_id: 2 })

    const res1 = await supertest(app).get('/api/collections')
    expect(res1.body.items).toHaveLength(1)
    expect(res1.body.items[0].name).toBe('Desk1')

    const res2 = await supertest(app).get('/api/collections?desktop=2')
    expect(res2.body.items).toHaveLength(1)
    expect(res2.body.items[0].name).toBe('Desk2')
  })
})

describe('POST /api/collections', () => {
  it('creates a collection and returns it with video_count', async () => {
    const res = await supertest(app)
      .post('/api/collections')
      .send({ name: 'Favorites', description: 'My picks', color: '#ff0000' })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeTypeOf('number')
    expect(res.body.name).toBe('Favorites')
    expect(res.body.description).toBe('My picks')
    expect(res.body.color).toBe('#ff0000')
    expect(res.body.video_count).toBe(0)
  })

  it('returns 400 if name is missing', async () => {
    const res = await supertest(app).post('/api/collections').send({ color: '#ff0000' })
    expect(res.status).toBe(400)
  })

  it('defaults color to red when not provided', async () => {
    const res = await supertest(app).post('/api/collections').send({ name: 'Plain' })
    expect(res.status).toBe(201)
    expect(res.body.color).toBe('#e11d48')
  })
})

describe('PUT & PATCH /api/collections/:id', () => {
  it('updates a collection', async () => {
    const created = await supertest(app).post('/api/collections').send({ name: 'Original' })
    const id = created.body.id

    const res = await supertest(app)
      .put(`/api/collections/${id}`)
      .send({ name: 'Updated', color: '#00ff00' })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Updated')
    expect(res.body.color).toBe('#00ff00')
  })

  it('PATCH also updates a collection', async () => {
    const created = await supertest(app).post('/api/collections').send({ name: 'A' })
    const res = await supertest(app)
      .patch(`/api/collections/${created.body.id}`)
      .send({ name: 'B' })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('B')
  })

  it('returns 404 for non-existent collection', async () => {
    const res = await supertest(app).put('/api/collections/9999').send({ name: 'Ghost' })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/collections/:id', () => {
  it('deletes a collection', async () => {
    const created = await supertest(app).post('/api/collections').send({ name: 'ToDelete' })
    const id = created.body.id

    expect((await supertest(app).delete(`/api/collections/${id}`)).status).toBe(200)

    const list = await supertest(app).get('/api/collections')
    expect(list.body.items).toHaveLength(0)
  })

  it('returns 404 for non-existent collection', async () => {
    const res = await supertest(app).delete('/api/collections/9999')
    expect(res.status).toBe(404)
  })
})

describe('PUT /api/collections/reorder', () => {
  it('reorders collections', async () => {
    const a = await supertest(app).post('/api/collections').send({ name: 'A' })
    const b = await supertest(app).post('/api/collections').send({ name: 'B' })
    const c = await supertest(app).post('/api/collections').send({ name: 'C' })

    const res = await supertest(app)
      .put('/api/collections/reorder')
      .send({ ids: [c.body.id, a.body.id, b.body.id] })
    expect(res.status).toBe(200)

    const list = await supertest(app).get('/api/collections')
    expect(list.body.items.map((x: { name: string }) => x.name)).toEqual(['C', 'A', 'B'])
  })

  it('returns 400 if ids is not an array', async () => {
    const res = await supertest(app).put('/api/collections/reorder').send({ ids: 'bad' })
    expect(res.status).toBe(400)
  })
})
