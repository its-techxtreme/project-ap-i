import { beforeEach, describe, expect, it } from 'vitest'

import { InMemorySupabase } from './helpers/inMemorySupabase'

describe('claim_next_job stale lock reclaim (in-memory)', () => {
  let db: InMemorySupabase

  beforeEach(() => {
    db = new InMemorySupabase()
    db.reset()
  })

  it('claims a queued job', async () => {
    const job = db.createQueuedJob({ nicheSlug: 'anime' })
    const { data, error } = await db.rpc('claim_next_job', {
      worker_id: 'worker-a',
      lock_minutes: 45,
    })
    expect(error).toBeNull()
    expect(data?.id).toBe(job.id)
    expect(data?.status).toBe('locked')
    expect(data?.locked_by).toBe('worker-a')
  })

  it('reclaims an expired locked job', async () => {
    const job = db.createQueuedJob({ nicheSlug: 'memes' })
    const past = new Date(Date.now() - 60_000).toISOString()
    Object.assign(job, {
      status: 'locked',
      locked_by: 'dead-worker',
      locked_at: past,
      lock_expires_at: past,
    })

    const { data, error } = await db.rpc('claim_next_job', {
      worker_id: 'worker-b',
      lock_minutes: 45,
    })

    expect(error).toBeNull()
    expect(data?.id).toBe(job.id)
    expect(data?.status).toBe('locked')
    expect(data?.locked_by).toBe('worker-b')
    expect(db.tables.job_events.some((e) => e.event_type === 'lock_reclaimed')).toBe(true)
  })

  it('does not reclaim a lock that is still valid', async () => {
    const job = db.createQueuedJob({ nicheSlug: 'sports' })
    const future = new Date(Date.now() + 30 * 60_000).toISOString()
    Object.assign(job, {
      status: 'locked',
      locked_by: 'worker-alive',
      locked_at: new Date().toISOString(),
      lock_expires_at: future,
    })

    const { data, error } = await db.rpc('claim_next_job', {
      worker_id: 'worker-c',
      lock_minutes: 45,
    })

    expect(error).toBeNull()
    expect(data).toBeNull()
    expect(job.locked_by).toBe('worker-alive')
  })
})
