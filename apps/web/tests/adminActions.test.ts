import { beforeEach, describe, expect, it, vi } from 'vitest'

const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`)
})

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}))

const fetchMock = vi.fn()
const supabaseAdminFromMock = vi.fn()
const supabaseAdminInsertMock = vi.fn()
const supabaseAdminSelectMock = vi.fn()
const supabaseAdminEqMock = vi.fn()
const supabaseAdminSingleMock = vi.fn()

const requireAdminMock = vi.fn<() => Promise<void>>()

vi.mock('@/lib/auth/requireAdmin', () => ({
  requireAdmin: requireAdminMock,
}))

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === 'jobs') {
        return {
          select: supabaseAdminSelectMock.mockReturnValue({
            eq: supabaseAdminEqMock.mockReturnValue({
              single: supabaseAdminSingleMock,
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }
      }
      if (table === 'audit_logs') {
        return {
          insert: supabaseAdminInsertMock,
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  },
}))

global.fetch = fetchMock

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()

  // Mock environment variables
  process.env.WORKER_BASE_URL = 'http://localhost:3001'
  process.env.WORKER_INTERNAL_TOKEN = 'test-worker-internal-token-min-32-chars'

  fetchMock.mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({ success: true }),
  })

  supabaseAdminSelectMock.mockReset()
  supabaseAdminEqMock.mockReset()
  supabaseAdminSingleMock.mockReset()
  supabaseAdminInsertMock.mockReset()
  supabaseAdminFromMock.mockReset()

  supabaseAdminEqMock.mockReturnValue({
    single: supabaseAdminSingleMock,
  })

  supabaseAdminSingleMock.mockResolvedValue({
    data: {
      id: 'job-test-1',
      status: 'failed',
      drive_file_id: 'drive-file-1',
      drive_deleted_at: null,
      drive_folder_state: 'processed_ready',
      youtube_retry_count: 1,
      instagram_retry_count: 1,
    },
    error: null,
  })

  supabaseAdminInsertMock.mockResolvedValue({ error: null })
})

describe('adminActions', () => {
  it('retryJobUpload() requires admin role', async () => {
    requireAdminMock.mockRejectedValueOnce(new Error('REDIRECT:/?error=forbidden'))

    const { retryJobUpload } = await import('@/app/actions/adminActions')
    await expect(retryJobUpload('job-test-1')).rejects.toThrow()
  })

  it('deleteDriveFile() requires admin role', async () => {
    requireAdminMock.mockRejectedValueOnce(new Error('REDIRECT:/?error=forbidden'))

    const { deleteDriveFile } = await import('@/app/actions/adminActions')
    await expect(deleteDriveFile('job-test-1')).rejects.toThrow()
  })

  it('retryJobUpload() calls worker endpoint with correct token header', async () => {
    requireAdminMock.mockResolvedValueOnce(undefined)

    const { retryJobUpload } = await import('@/app/actions/adminActions')
    await retryJobUpload('job-test-1')

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/jobs/job-test-1/retry-upload'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Worker-Token': expect.any(String),
        }),
      }),
    )
  })

  it('deleteDriveFile() writes audit log', async () => {
    requireAdminMock.mockResolvedValueOnce(undefined)

    const { deleteDriveFile } = await import('@/app/actions/adminActions')
    await deleteDriveFile('job-test-1')

    expect(supabaseAdminInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_type: 'admin',
        action: 'drive_delete_requested',
        target_type: 'job',
        target_id: 'job-test-1',
      }),
    )
  })

  it('markJobIgnored() sets job status to ignored', async () => {
    requireAdminMock.mockResolvedValueOnce(undefined)

    const { markJobIgnored } = await import('@/app/actions/adminActions')
    const result = await markJobIgnored('job-test-1')

    expect(result).toEqual({ success: true, jobId: 'job-test-1' })
  })

  it('markJobIgnored() writes audit log', async () => {
    requireAdminMock.mockResolvedValueOnce(undefined)

    const { markJobIgnored } = await import('@/app/actions/adminActions')
    await markJobIgnored('job-test-1')

    expect(supabaseAdminInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_type: 'admin',
        action: 'job_marked_ignored',
        target_type: 'job',
        target_id: 'job-test-1',
      }),
    )
  })

  it('retryJobUpload() returns error if job not found', async () => {
    requireAdminMock.mockResolvedValueOnce(undefined)

    supabaseAdminSingleMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'not found' },
    })

    const { retryJobUpload } = await import('@/app/actions/adminActions')
    const result = await retryJobUpload('job-not-found')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Job not found')
  })

  it('retryJobUpload() returns error if drive file missing', async () => {
    requireAdminMock.mockResolvedValueOnce(undefined)

    supabaseAdminSingleMock.mockResolvedValueOnce({
      data: {
        id: 'job-test-1',
        status: 'failed',
        drive_file_id: null,
        drive_deleted_at: '2024-01-01T00:00:00Z',
        youtube_retry_count: 1,
        instagram_retry_count: 1,
      },
      error: null,
    })

    const { retryJobUpload } = await import('@/app/actions/adminActions')
    const result = await retryJobUpload('job-test-1')

    expect(result.success).toBe(false)
    expect(result.error).toContain('Drive file missing')
  })

  it('deleteDriveFile() returns error if job not found', async () => {
    requireAdminMock.mockResolvedValueOnce(undefined)

    supabaseAdminSingleMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'not found' },
    })

    const { deleteDriveFile } = await import('@/app/actions/adminActions')
    const result = await deleteDriveFile('job-not-found')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Job not found')
  })

  it('deleteDriveFile() returns error if no drive file', async () => {
    requireAdminMock.mockResolvedValueOnce(undefined)

    supabaseAdminSingleMock.mockResolvedValueOnce({
      data: {
        id: 'job-test-1',
        status: 'failed',
        drive_file_id: null,
        drive_deleted_at: null,
        drive_folder_state: 'processed_ready',
      },
      error: null,
    })

    const { deleteDriveFile } = await import('@/app/actions/adminActions')
    const result = await deleteDriveFile('job-test-1')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Job has no Drive file to delete')
  })

  it('deleteDriveFile() returns error if status not deletable', async () => {
    requireAdminMock.mockResolvedValueOnce(undefined)

    supabaseAdminSingleMock.mockResolvedValueOnce({
      data: {
        id: 'job-test-1',
        status: 'processing',
        drive_file_id: 'drive-file-1',
        drive_deleted_at: null,
        drive_folder_state: 'processed_ready',
      },
      error: null,
    })

    const { deleteDriveFile } = await import('@/app/actions/adminActions')
    const result = await deleteDriveFile('job-test-1')

    expect(result.success).toBe(false)
    expect(result.error).toContain('not allowed')
  })
})