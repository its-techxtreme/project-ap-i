import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/config', () => ({
  config: {
    UPLOAD_STALE_THRESHOLD_MS: 1_500_000,
  },
}))

const fromMock = vi.fn()
const finalizeMock = vi.fn()
const writeJobEventMock = vi.fn()

vi.mock('../src/db/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}))

vi.mock('../src/db/jobsRepo', () => ({
  writeJobEvent: (...args: unknown[]) => writeJobEventMock(...args),
}))

vi.mock('../src/jobs/uploadFinalize', () => ({
  finalizeUploadStatus: (...args: unknown[]) => finalizeMock(...args),
}))

vi.mock('../src/logging/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

function chainable(result: unknown) {
  const api: Record<string, unknown> = {}
  const self = () => api
  for (const method of ['select', 'eq', 'update', 'limit', 'single', 'in', 'is', 'not', 'or', 'gt', 'gte']) {
    api[method] = vi.fn(self)
  }
  api.then = undefined
  // terminal helpers
  api.limit = vi.fn(async () => result)
  api.single = vi.fn(async () => result)
  api.eq = vi.fn(() => api)
  api.select = vi.fn(() => api)
  api.update = vi.fn(() => api)
  return api
}

describe('recoverStaleUploadingJobs', () => {
  beforeEach(() => {
    fromMock.mockReset()
    finalizeMock.mockReset()
    writeJobEventMock.mockReset()
    finalizeMock.mockResolvedValue('awaiting_verification')
    writeJobEventMock.mockResolvedValue(undefined)
  })

  it('recovers YT-done / IG-stuck zombie and finalizes partial failure', async () => {
    const staleUpdatedAt = new Date(Date.now() - 2 * 60 * 60_000).toISOString()
    const expiredLock = new Date(Date.now() - 60_000).toISOString()

    const jobsSelect = {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'job-zombie-1',
                status: 'uploading',
                youtube_upload_status: 'uploaded',
                instagram_upload_status: 'uploading',
                locked_by: 'worker-dead',
                lock_expires_at: expiredLock,
                updated_at: staleUpdatedAt,
              },
            ],
            error: null,
          }),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    }

    const attemptsUpdate = {
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        })),
      })),
    }

    let jobsCalls = 0
    fromMock.mockImplementation((table: string) => {
      if (table === 'jobs') {
        jobsCalls += 1
        if (jobsCalls === 1) return jobsSelect
        if (jobsCalls === 2) {
          // platform status update
          return {
            update: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ error: null }),
            })),
          }
        }
        if (jobsCalls === 3) {
          // latest statuses
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: {
                    youtube_upload_status: 'uploaded',
                    instagram_upload_status: 'failed',
                  },
                  error: null,
                }),
              })),
            })),
          }
        }
        // clear lock
        return {
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        }
      }
      if (table === 'upload_attempts') return attemptsUpdate
      return chainable({ data: null, error: null })
    })

    const { recoverStaleUploadingJobs } = await import('../src/jobs/recoverStaleUploads')
    const recovered = await recoverStaleUploadingJobs('worker-test')

    expect(recovered).toBe(1)
    expect(finalizeMock).toHaveBeenCalledWith('job-zombie-1', 'uploaded', 'failed')
    expect(writeJobEventMock).toHaveBeenCalled()
  })

  it('skips fresh uploading jobs that still have an active lock', async () => {
    const freshUpdatedAt = new Date().toISOString()
    const activeLock = new Date(Date.now() + 30 * 60_000).toISOString()

    fromMock.mockImplementation((table: string) => {
      if (table === 'jobs') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'job-active',
                    status: 'uploading',
                    youtube_upload_status: 'uploading',
                    instagram_upload_status: 'pending',
                    locked_by: 'worker-live',
                    lock_expires_at: activeLock,
                    updated_at: freshUpdatedAt,
                  },
                ],
                error: null,
              }),
            })),
          })),
        }
      }
      return chainable({ data: null, error: null })
    })

    vi.resetModules()
    const { recoverStaleUploadingJobs } = await import('../src/jobs/recoverStaleUploads')
    const recovered = await recoverStaleUploadingJobs('worker-test')
    expect(recovered).toBe(0)
    expect(finalizeMock).not.toHaveBeenCalled()
  })

  it('skips fresh uploading jobs even when lock_expires_at is null', async () => {
    const freshUpdatedAt = new Date().toISOString()

    fromMock.mockImplementation((table: string) => {
      if (table === 'jobs') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'job-live-no-lock',
                    status: 'uploading',
                    youtube_upload_status: 'uploading',
                    instagram_upload_status: 'uploading',
                    locked_by: null,
                    lock_expires_at: null,
                    updated_at: freshUpdatedAt,
                  },
                ],
                error: null,
              }),
            })),
          })),
        }
      }
      return chainable({ data: null, error: null })
    })

    vi.resetModules()
    const { recoverStaleUploadingJobs } = await import('../src/jobs/recoverStaleUploads')
    const recovered = await recoverStaleUploadingJobs('worker-test')
    expect(recovered).toBe(0)
    expect(finalizeMock).not.toHaveBeenCalled()
  })
})
