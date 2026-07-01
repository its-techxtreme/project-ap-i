import { beforeEach, describe, expect, it, vi } from 'vitest'

const updateMock = vi.fn()
const eqMock = vi.fn()
const insertMock = vi.fn()
const fromMock = vi.fn()

vi.mock('../src/db/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => fromMock(...args),
    rpc: vi.fn(),
  },
}))

describe('mock pipeline', () => {
  beforeEach(() => {
    updateMock.mockReset()
    eqMock.mockReset()
    insertMock.mockReset()
    fromMock.mockReset()

    eqMock.mockReturnValue({ error: null })
    updateMock.mockReturnValue({ eq: eqMock })
    insertMock.mockResolvedValue({ error: null })
    fromMock.mockImplementation((table: string) => {
      if (table === 'jobs') {
        return { update: updateMock }
      }
      if (table === 'job_events') {
        return { insert: insertMock }
      }
      throw new Error(`Unexpected table: ${table}`)
    })
  })

  it('mock process transitions through all statuses', async () => {
    const { runMockProcess } = await import('../src/jobs/mockPipeline')
    const finalStatus = await runMockProcess('job-1')

    expect(finalStatus).toBe('processed')
    expect(updateMock).toHaveBeenCalledTimes(4)
    expect(updateMock.mock.calls.map((c) => c[0].status)).toEqual([
      'downloading',
      'downloaded',
      'processing',
      'processed',
    ])
  })

  it('mock verify sets completed_at and verified platform statuses', async () => {
    const { runMockVerify } = await import('../src/jobs/mockPipeline')
    const result = await runMockVerify('job-4')

    expect(result).toBe('completed')
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        youtube_upload_status: 'verified',
        instagram_upload_status: 'verified',
        verification_status: 'verified',
        completed_at: expect.any(String),
      }),
    )
  })

  it('writes job events for each stage transition', async () => {
    const { runMockProcess } = await import('../src/jobs/mockPipeline')
    await runMockProcess('job-5')

    expect(insertMock).toHaveBeenCalledTimes(4)
    expect(insertMock.mock.calls.every((call) => call[0].job_id === 'job-5')).toBe(true)
  })

  it('runUpload returns blocked when REAL_UPLOADS_ENABLED is true', async () => {
    vi.resetModules()
    vi.doMock('../src/config', () => ({
      config: {
        REAL_UPLOADS_ENABLED: true,
        VERIFY_DELAY_MINUTES: 30,
      },
    }))

    const { runUpload } = await import('../src/jobs/runUpload')
    const result = await runUpload('job-3')

    expect(result).toEqual({ blocked: true })
  })

  it('upload endpoint returns 503 when REAL_UPLOADS_ENABLED is true', async () => {
    vi.resetModules()
    vi.doMock('../src/config', () => ({
      config: {
        REAL_UPLOADS_ENABLED: true,
        VERIFY_DELAY_MINUTES: 30,
        PORT: 3001,
        NODE_ENV: 'test',
        WORKER_INTERNAL_TOKEN: 'test-worker-internal-token-min-32-chars',
      },
    }))

    vi.doMock('../src/jobs/runUpload', () => ({
      runUpload: vi.fn().mockResolvedValue({ blocked: true }),
    }))

    const { buildServer } = await import('../src/server')
    const app = await buildServer()

    const response = await app.inject({
      method: 'POST',
      url: '/jobs/job-6/upload',
      headers: { 'x-worker-token': 'test-worker-internal-token-min-32-chars' },
    })

    expect(response.statusCode).toBe(503)
    expect(response.json()).toEqual({
      error: 'Real uploads not implemented yet. Use mock mode.',
    })
  })
})
