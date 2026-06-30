import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.fn()
const infoMock = vi.fn()
const errorMock = vi.fn()

vi.mock('../src/db/supabaseAdmin', () => ({
  supabaseAdmin: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: vi.fn(),
  },
}))

vi.mock('../src/logging/logger', () => ({
  logger: {
    info: (...args: unknown[]) => infoMock(...args),
    error: (...args: unknown[]) => errorMock(...args),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

describe('claimNextJob', () => {
  beforeEach(() => {
    rpcMock.mockReset()
    infoMock.mockReset()
    errorMock.mockReset()
  })

  it('calls Supabase RPC claim_next_job', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null })

    const { claimNextJob } = await import('../src/db/jobsRepo')
    await claimNextJob('worker-test')

    expect(rpcMock).toHaveBeenCalledWith('claim_next_job', {
      worker_id: 'worker-test',
      lock_minutes: 45,
    })
  })

  it('returns null when no job is available', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null })

    const { claimNextJob } = await import('../src/db/jobsRepo')
    const result = await claimNextJob('worker-test')

    expect(result).toBeNull()
  })

  it('returns null when RPC returns Supabase NULL composite (all-null fields)', async () => {
    rpcMock.mockResolvedValue({
      data: { id: null, status: null, source_url: null },
      error: null,
    })

    const { claimNextJob } = await import('../src/db/jobsRepo')
    const result = await claimNextJob('worker-test')

    expect(result).toBeNull()
  })

  it('returns job object when a queued job exists', async () => {
    const job = {
      id: 'job-123',
      status: 'locked',
      source_url: 'https://youtube.com/shorts/abc',
      source_platform: 'youtube',
      niche_id: 'niche-1',
      rights_confirmed: true,
    }
    rpcMock.mockResolvedValue({ data: job, error: null })

    const { claimNextJob } = await import('../src/db/jobsRepo')
    const result = await claimNextJob('worker-test')

    expect(result).toEqual(job)
  })

  it('logs job ID and worker ID on claim via route handler', async () => {
    const job = {
      id: 'job-456',
      status: 'locked',
      source_url: 'https://youtube.com/shorts/abc',
      source_platform: 'youtube',
      niche_id: 'niche-1',
      rights_confirmed: true,
    }
    rpcMock.mockResolvedValue({ data: job, error: null })

    const insertMock = vi.fn().mockResolvedValue({ error: null })
    const fromMock = vi.fn().mockReturnValue({ insert: insertMock })

    vi.doMock('../src/db/supabaseAdmin', () => ({
      supabaseAdmin: {
        rpc: rpcMock,
        from: fromMock,
      },
    }))

    const { buildServer } = await import('../src/server')
    const app = await buildServer()

    await app.inject({
      method: 'POST',
      url: '/jobs/claim',
      headers: { 'x-worker-token': 'test-worker-internal-token-min-32-chars' },
    })

    expect(infoMock).toHaveBeenCalledWith(
      expect.objectContaining({ msg: 'Job claimed', jobId: 'job-456' }),
    )
  })

  it('does not log service role key', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null })

    const { claimNextJob } = await import('../src/db/jobsRepo')
    await claimNextJob('worker-test')

    const allLogCalls = [...infoMock.mock.calls, ...errorMock.mock.calls]
    const serialized = JSON.stringify(allLogCalls)
    expect(serialized).not.toContain('test-service-role-key')
    expect(serialized).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
  })
})
