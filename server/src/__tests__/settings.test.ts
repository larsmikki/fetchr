import supertest from 'supertest'
import { describe, it, expect, beforeEach } from 'vitest'
import { createApp } from '../app.js'
import { resetDb } from '../db/connection.js'
import { runMigrations } from '../db/migrate.js'

const app = createApp()

beforeEach(async () => {
  await resetDb()
  runMigrations()
})

describe('GET /api/settings', () => {
  it('returns empty object when no settings exist', async () => {
    const res = await supertest(app).get('/api/settings')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({})
  })
})

describe('PATCH /api/settings', () => {
  it('sets and retrieves multiple settings', async () => {
    await supertest(app)
      .patch('/api/settings')
      .send({ download_path: '/tmp/videos', theme: 'dark' })

    const res = await supertest(app).get('/api/settings')
    expect(res.status).toBe(200)
    expect(res.body.download_path).toBe('/tmp/videos')
    expect(res.body.theme).toBe('dark')
  })

  it('updates an existing key', async () => {
    await supertest(app).patch('/api/settings').send({ key1: 'old' })
    await supertest(app).patch('/api/settings').send({ key1: 'new' })

    const res = await supertest(app).get('/api/settings')
    expect(res.body.key1).toBe('new')
  })

  it('returns 400 for non-object body', async () => {
    const res = await supertest(app)
      .patch('/api/settings')
      .send([{ key: 'value' }])
    expect(res.status).toBe(400)
  })
})
