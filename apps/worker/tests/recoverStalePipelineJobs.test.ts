import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/config', () => ({
  config: {
    PIPELINE_STALE_THRESHOLD_MS: 1_500_000,
  },
}))

const fromMock = vi.fn()
const writeJobEventMock = vi.fn()

vi.mock('../src/db/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}))

vi.mock('../src/db/jobsRepo', () => ({
  writeJobEvent: (...args: unknown[]) => writeJobEventMock(...args),
}))

vi.mock('../src/logging/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

describe('recoverStalePipelineJobs', () => {
  beforeEach(() => {
    fromMock.mockReset()
    writeJobEventMock.mockReset()
    writeJobEventMock.mockResolvedValue(undefined)
  })

  it('requeues downloading job with expired lock', async () => {
    const staleUpdatedAt = new Date(Date.now() - 2 * 60 * 60_000).toISOString()
    const expiredLock = new Date(Date.now() - 60_000).toISOString()
    const updateEq = vi.fn().mockResolvedValue({ error: null })

    fromMock.mockImplementation((table: string) => {
      if (table === 'jobs') {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'job-dl-1',
                    status: 'downloading',
                    locked_by: 'worker-dead',
                    lock_expires_at: expiredLock,
                    updated_at: staleUpdatedAt,
                    failure_code: null,
                    retry_count: 0,
                  },
                ],
                error: null,
              }),
            })),
          })),
          update: vi.fn(() => ({
            eq: updateEq,
          })),
        }
      }
      return {}
    })

    const { recoverStalePipelineJobs } = await import('../src/jobs/recoverStalePipelineJobs')
    const recovered = await recoverStalePipelineJobs('worker-test')

    expect(recovered).toBe(1)
    expect(updateEq).toHaveBeenCalled()
    expect(writeJobEventMock).toHaveBeenCalledWith(
      'job-dl-1',
      'claim',
      'stale_pipeline_recovered',
      expect.stringContaining('requeued'),
      'warning',
      expect.objectContaining({ nextStatus: 'queued', previousStatus: 'downloading' }),
    )
  })

  it('does not touch jobs with fresh locks and recent updates', async () => {
    const freshUpdatedAt = new Date().toISOString()
    const futureLock = new Date(Date.now() + 30 * 60_000).toISOString()

    fromMock.mockImplementation(() => ({
      select: vi.fn(() => ({
        in: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'job-active',
                status: 'processing',
                locked_by: 'worker-live',
                lock_expires_at: futureLock,
                updated_at: freshUpdatedAt,
                failure_code: null,
                retry_count: 0,
              },
            ],
            error: null,
          }),
        })),
      })),
      update: vi.fn(),
    }))

    const { recoverStalePipelineJobs } = await import('../src/jobs/recoverStalePipelineJobs')
    const recovered = await recoverStalePipelineJobs('worker-test')

    expect(recovered).toBe(0)
    expect(writeJobEventMock).not.toHaveBeenCalled()
  })

  it('fails jobs that already have PIPELINE_STALE after another stall', async () => {
    const staleUpdatedAt = new Date(Date.now() - 2 * 60 * 60_000).toISOString()
    const expiredLock = new Date(Date.now() - 60_000).toISOString()
    const updateEq = vi.fn().mockResolvedValue({ error: null })

    fromMock.mockImplementation(() => ({
      select: vi.fn(() => ({
        in: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'job-thrash',
                status: 'processing',
                locked_by: 'worker-dead',
                lock_expires_at: expiredLock,
                updated_at: staleUpdatedAt,
                failure_code: 'PIPELINE_STALE',
                retry_count: 1,
              },
            ],
            error: null,
          }),
        })),
      })),
      update: vi.fn(() => ({ eq: updateEq })),
    }))

    vi.resetModules()
    const { recoverStalePipelineJobs } = await import('../src/jobs/recoverStalePipelineJobs')
    const recovered = await recoverStalePipelineJobs('worker-test')

    expect(recovered).toBe(1)
    expect(writeJobEventMock).toHaveBeenCalledWith(
      'job-thrash',
      'claim',
      'stale_pipeline_recovered',
      expect.stringContaining('failed'),
      'warning',
      expect.objectContaining({ nextStatus: 'failed' }),
    )
  })
})
