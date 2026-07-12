import { beforeEach, describe, expect, it, vi } from 'vitest'

const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`)
})

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}))

const fetchMock = vi.fn()
const supabaseAdminInsertMock = vi.fn()
const supabaseAdminSelectMock = vi.fn()
const supabaseAdminEqMock = vi.fn()
const supabaseAdminSingleMock = vi.fn()
const adminCommandsInsertMock = vi.fn()
const adminCommandsSelectMock = vi.fn()
const adminCommandsSingleMock = vi.fn()
const platformAccountsSingleMock = vi.fn()
const jobsDeleteMock = vi.fn()
const jobsDeleteEqMock = vi.fn()

const requireAdminMock = vi.fn<() => Promise<void>>()
const getAdminUsernameMock = vi.fn<() => Promise<string | null>>()

vi.mock('@/lib/auth/requireAdmin', () => ({
  requireAdmin: requireAdminMock,
}))

vi.mock('@/lib/auth/getUserRole', () => ({
  getAdminUsername: () => getAdminUsernameMock(),
  getUserRole: vi.fn(),
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
          delete: jobsDeleteMock.mockReturnValue({
            eq: jobsDeleteEqMock.mockResolvedValue({ error: null }),
          }),
        }
      }
      if (table === 'platform_accounts') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: platformAccountsSingleMock,
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
      if (table === 'admin_commands') {
        return {
          insert: adminCommandsInsertMock.mockReturnValue({
            select: adminCommandsSelectMock.mockReturnValue({
              single: adminCommandsSingleMock,
            }),
          }),
        }
      }
      if (table === 'job_events') {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
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

  getAdminUsernameMock.mockResolvedValue('test-admin')

  supabaseAdminSelectMock.mockReset()
  supabaseAdminEqMock.mockReset()
  supabaseAdminSingleMock.mockReset()
  supabaseAdminInsertMock.mockReset()
  adminCommandsInsertMock.mockReset()
  adminCommandsSelectMock.mockReset()
  adminCommandsSingleMock.mockReset()
  platformAccountsSingleMock.mockReset()
  jobsDeleteMock.mockReset()
  jobsDeleteEqMock.mockReset()

  supabaseAdminEqMock.mockReturnValue({
    single: supabaseAdminSingleMock,
  })

  jobsDeleteMock.mockReturnValue({
    eq: jobsDeleteEqMock.mockResolvedValue({ error: null }),
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

  platformAccountsSingleMock.mockResolvedValue({
    data: {
      id: 'acc-1',
      status: 'login_required',
      login_required: true,
    },
    error: null,
  })

  adminCommandsSingleMock.mockResolvedValue({
    data: { id: 'cmd-1' },
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

  it('retryJobUpload() enqueues admin_commands and does not call worker HTTP', async () => {
    requireAdminMock.mockResolvedValueOnce(undefined)

    const { retryJobUpload } = await import('@/app/actions/adminActions')
    const result = await retryJobUpload('job-test-1')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(adminCommandsInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        job_id: 'job-test-1',
        command: 'retry_upload',
        status: 'pending',
        requested_by: null,
        payload: expect.objectContaining({
          requested_by_username: 'test-admin',
        }),
      }),
    )
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        queued: true,
        commandId: 'cmd-1',
      }),
    )
  })

  it('deleteDriveFile() writes audit log and enqueues command', async () => {
    requireAdminMock.mockResolvedValueOnce(undefined)

    const { deleteDriveFile } = await import('@/app/actions/adminActions')
    await deleteDriveFile('job-test-1')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(adminCommandsInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        job_id: 'job-test-1',
        command: 'delete_drive_file',
        status: 'pending',
      }),
    )
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

  it('retryJobUpload() returns friendly error when command already pending', async () => {
    requireAdminMock.mockResolvedValueOnce(undefined)
    adminCommandsSingleMock.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'duplicate key' },
    })

    const { retryJobUpload } = await import('@/app/actions/adminActions')
    const result = await retryJobUpload('job-test-1')

    expect(result.success).toBe(false)
    expect(result.error).toContain('already queued')
  })

  it('bulkRetryJobUploads() aggregates per-job results', async () => {
    requireAdminMock.mockResolvedValue(undefined)

    const { bulkRetryJobUploads } = await import('@/app/actions/adminActions')
    const result = await bulkRetryJobUploads(['job-test-1', 'job-test-1'])

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.succeeded).toBe(1)
      expect(result.failed).toBe(0)
      expect(result.message).toContain('queued for retry')
    }
  })

  it('bulkMarkJobsIgnored() returns error when nothing selected', async () => {
    requireAdminMock.mockResolvedValueOnce(undefined)

    const { bulkMarkJobsIgnored } = await import('@/app/actions/adminActions')
    const result = await bulkMarkJobsIgnored([])

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('No jobs selected')
    }
  })

  it('markAccountLoginRecovered() clears login_required and audits', async () => {
    requireAdminMock.mockResolvedValue(undefined)

    const { markAccountLoginRecovered } = await import('@/app/actions/adminActions')
    const result = await markAccountLoginRecovered('acc-1')

    expect(result.success).toBe(true)
    expect(supabaseAdminInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_type: 'admin',
        action: 'account_login_recovered',
        target_type: 'platform_account',
        target_id: 'acc-1',
      }),
    )
  })

  it('resumePlatformAccount() blocks while login is still required', async () => {
    requireAdminMock.mockResolvedValue(undefined)
    platformAccountsSingleMock.mockResolvedValueOnce({
      data: { id: 'acc-1', status: 'login_required', login_required: true },
      error: null,
    })

    const { resumePlatformAccount } = await import('@/app/actions/adminActions')
    const result = await resumePlatformAccount('acc-1')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('requires login')
    }
  })

  it('deleteJobRecord() hard-deletes the job and writes audit log', async () => {
    requireAdminMock.mockResolvedValue(undefined)

    const { deleteJobRecord } = await import('@/app/actions/adminActions')
    const result = await deleteJobRecord('job-test-1')

    expect(result.success).toBe(true)
    expect(jobsDeleteEqMock).toHaveBeenCalledWith('id', 'job-test-1')
    expect(supabaseAdminInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_type: 'admin',
        action: 'job_deleted',
        target_type: 'job',
        target_id: 'job-test-1',
      }),
    )
  })

  it('deleteJobRecord() blocks active in-flight statuses', async () => {
    requireAdminMock.mockResolvedValueOnce(undefined)
    supabaseAdminSingleMock.mockResolvedValueOnce({
      data: {
        id: 'job-test-1',
        status: 'uploading',
        drive_file_id: 'drive-1',
        drive_deleted_at: null,
        source_url: 'https://www.youtube.com/shorts/x',
        niche_id: 'niche-1',
      },
      error: null,
    })

    const { deleteJobRecord } = await import('@/app/actions/adminActions')
    const result = await deleteJobRecord('job-test-1')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('uploading')
    }
    expect(jobsDeleteEqMock).not.toHaveBeenCalled()
  })
})
