import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from '../src/db/connection.js'
import { runMigrations } from '../src/db/migrate.js'
import { videosRepo } from '../src/db/repositories/videos.js'
import { collectionsRepo } from '../src/db/repositories/collections.js'
import { settingsRepo } from '../src/db/repositories/settings.js'
import { jobsRepo } from '../src/db/repositories/jobs.js'

beforeEach(async () => {
  await resetDb()
  runMigrations()
})

describe('videosRepo', () => {
  it('creates and reads back a video', () => {
    const v = videosRepo.create({ pageUrl: 'https://x.test/v', collectionId: null, notes: 'hi', desktopId: 1 })
    expect(v.id).toBeTypeOf('number')
    expect(v.page_url).toBe('https://x.test/v')
    expect(v.fetch_status).toBe('pending')
    expect(videosRepo.findById(v.id)?.notes).toBe('hi')
  })

  it('filters list by desktop, collection, and search query', () => {
    const c1 = collectionsRepo.create({ name: 'Fav', description: null, color: '#fff', desktopId: 1 })
    const v1 = videosRepo.create({ pageUrl: 'https://a.test/1', collectionId: c1.id, notes: null, desktopId: 1 })
    videosRepo.create({ pageUrl: 'https://a.test/2', collectionId: null, notes: null, desktopId: 1 })
    videosRepo.create({ pageUrl: 'https://b.test/3', collectionId: null, notes: 'holiday', desktopId: 2 })

    expect(videosRepo.list({ desktopId: 1, page: 1, limit: 10 }).total).toBe(2)
    expect(videosRepo.list({ desktopId: 2, page: 1, limit: 10 }).total).toBe(1)
    expect(videosRepo.list({ desktopId: 1, collectionId: c1.id, page: 1, limit: 10 }).total).toBe(1)
    expect(videosRepo.list({ desktopId: 1, collectionId: 'null', page: 1, limit: 10 }).total).toBe(1)
    expect(videosRepo.list({ desktopId: 2, q: 'holiday', page: 1, limit: 10 }).items[0].id).toBe(3)
    expect(videosRepo.findById(v1.id)?.collection_id).toBe(c1.id)
  })

  it('updates only the provided fields', () => {
    const v = videosRepo.create({ pageUrl: 'https://x.test/v', collectionId: null, notes: 'before', desktopId: 1 })
    const updated = videosRepo.update(v.id, { title: 'New title' })!
    expect(updated.title).toBe('New title')
    expect(updated.notes).toBe('before')
  })

  it('resetMetadata clears extracted fields while keeping URL/notes/collection', () => {
    const v = videosRepo.create({ pageUrl: 'https://x.test/v', collectionId: null, notes: 'keep me', desktopId: 1 })
    videosRepo.update(v.id, { title: 'before', duration: 60, fetchStatus: 'ok' })
    const reset = videosRepo.update(v.id, { resetMetadata: true, pageUrl: 'https://x.test/v2' })!
    expect(reset.title).toBeNull()
    expect(reset.duration).toBeNull()
    expect(reset.fetch_status).toBe('pending')
    expect(reset.page_url).toBe('https://x.test/v2')
    expect(reset.notes).toBe('keep me')
  })

  it('detects duplicate URLs per desktop', () => {
    videosRepo.create({ pageUrl: 'https://x.test/v', collectionId: null, notes: null, desktopId: 1 })
    expect(videosRepo.existsByUrl('https://x.test/v', 1)).toBe(true)
    expect(videosRepo.existsByUrl('https://x.test/v', 2)).toBe(false)
  })
})

describe('collectionsRepo', () => {
  it('creates with auto-incrementing sort_order', () => {
    const a = collectionsRepo.create({ name: 'A', description: null, color: '#fff', desktopId: 1 })
    const b = collectionsRepo.create({ name: 'B', description: null, color: '#fff', desktopId: 1 })
    expect(b.sort_order).toBe(a.sort_order + 1)
  })

  it('pruneIfEmpty deletes a collection with no videos', () => {
    const c = collectionsRepo.create({ name: 'Empty', description: null, color: '#fff', desktopId: 1 })
    collectionsRepo.pruneIfEmpty(c.id)
    expect(collectionsRepo.findById(c.id)).toBeNull()
  })

  it('pruneIfEmpty keeps a collection that has videos', () => {
    const c = collectionsRepo.create({ name: 'Full', description: null, color: '#fff', desktopId: 1 })
    videosRepo.create({ pageUrl: 'https://x.test/v', collectionId: c.id, notes: null, desktopId: 1 })
    collectionsRepo.pruneIfEmpty(c.id)
    expect(collectionsRepo.findById(c.id)).not.toBeNull()
  })

  it('reorders by index in the supplied id array', () => {
    const a = collectionsRepo.create({ name: 'A', description: null, color: '#fff', desktopId: 1 })
    const b = collectionsRepo.create({ name: 'B', description: null, color: '#fff', desktopId: 1 })
    const c = collectionsRepo.create({ name: 'C', description: null, color: '#fff', desktopId: 1 })
    collectionsRepo.reorder([c.id, a.id, b.id])
    const list = collectionsRepo.list(1).map(x => x.name)
    expect(list).toEqual(['C', 'A', 'B'])
  })
})

describe('settingsRepo', () => {
  it('set / getAll round-trips', () => {
    settingsRepo.set('foo', 'bar')
    settingsRepo.set('baz', 'qux')
    expect(settingsRepo.getAll()).toEqual({ foo: 'bar', baz: 'qux' })
  })

  it('getMany filters by key list', () => {
    settingsRepo.setMany({ a: '1', b: '2', c: '3' })
    expect(settingsRepo.getMany(['a', 'c'])).toEqual({ a: '1', c: '3' })
  })
})

describe('jobsRepo', () => {
  it('enqueue + claimNext transitions status to running and increments attempts', () => {
    const job = jobsRepo.enqueue({ videoId: null, kind: 'extract_metadata', payload: { url: 'https://x.test/v' } })
    expect(job.status).toBe('pending')
    expect(job.attempts).toBe(0)

    const claimed = jobsRepo.claimNext()
    expect(claimed?.id).toBe(job.id)
    expect(claimed?.status).toBe('running')
    expect(claimed?.attempts).toBe(1)
  })

  it('markFailed with retry=true requeues; retry=false marks error', () => {
    const job = jobsRepo.enqueue({ videoId: null, kind: 'extract_metadata' })
    jobsRepo.claimNext()
    jobsRepo.markFailed(job.id, 'boom', true)
    expect(jobsRepo.findById(job.id)?.status).toBe('pending')
    jobsRepo.claimNext()
    jobsRepo.markFailed(job.id, 'boom', false)
    expect(jobsRepo.findById(job.id)?.status).toBe('error')
  })

  it('resetRunningToPending restores running jobs after a server restart', () => {
    const job = jobsRepo.enqueue({ videoId: null, kind: 'extract_metadata' })
    jobsRepo.claimNext()
    expect(jobsRepo.findById(job.id)?.status).toBe('running')
    jobsRepo.resetRunningToPending()
    expect(jobsRepo.findById(job.id)?.status).toBe('pending')
  })

  it('cancelPendingForVideo cancels jobs targeting that video', () => {
    const j1 = jobsRepo.enqueue({ videoId: 42, kind: 'extract_metadata' })
    const j2 = jobsRepo.enqueue({ videoId: 42, kind: 'download_video' })
    const other = jobsRepo.enqueue({ videoId: 99, kind: 'extract_metadata' })
    jobsRepo.cancelPendingForVideo(42)
    expect(jobsRepo.findById(j1.id)?.status).toBe('cancelled')
    expect(jobsRepo.findById(j2.id)?.status).toBe('cancelled')
    expect(jobsRepo.findById(other.id)?.status).toBe('pending')
  })
})
