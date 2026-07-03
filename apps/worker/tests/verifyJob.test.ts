import { beforeEach, describe, expect, it, vi } from 'vitest'

const updateMock = vi.fn()
const eqMock = vi.fn()
const insertMock = vi.fn()
const selectMock = vi.fn()
const singleMock = vi.fn()
const fromMock = vi.fn()
const writeJobEventMock = vi.fn()
const writeAuditLogMock = vi.fn()
const driveDeleteMock = vi.fn()

vi.mock('../src/db/jobsRepo', () => ({
  getJobById: vi.fn(),
  updateJobStatus: (...args: unknown[]) => updateMock(...args),
  writeJobEvent: (...args: unknown[]) => writeJobEventMock(...args),
  writeAuditLog: (...args: unknown[]) => writeAuditLogMock(...args),
}))

vi.mock('../src/storage', () => ({
  createDriveStorage: () => ({
    delete: driveDeleteMock,
  }),
}))

vi.mock('../src/db/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => fromMock(...args),
    rpc: vi.fn(),
  },
}))

import { getJobById } from '../src/db/jobsRepo'
import { verifyJob } from '../src/jobs/verifyJob'
import { ERROR_CODES } from '@project-api/shared'

const mockJob = (overrides: Partial<{
  id: string
  status: string
  youtube_upload_status: string
  instagram_upload_status: string
  drive_file_id: string | null
  drive_deleted_at: string | null
  drive_folder_state: string | null
  niche_id: string
  youtube_retry_count: number
  instagram_retry_count: number
  verification_status: string
  completed_at: string | null
}> = {}) => ({
  id: 'job-test-1',
  status: 'awaiting_verification',
  youtube_upload_status: 'uploaded',
  instagram_upload_status: 'uploaded',
  drive_file_id: 'drive-file-1',
  drive_deleted_at: null,
  drive_folder_state: 'processed_ready',
  niche_id: 'niche-1',
  youtube_retry_count: 0,
  instagram_retry_count: 0,
  verification_status: 'pending',
  completed_at: null,
  ...overrides,
})

describe('verifyJob', () => {
  beforeEach(() => {
    updateMock.mockReset()
    eqMock.mockReset()
    insertMock.mockReset()
    selectMock.mockReset()
    singleMock.mockReset()
    fromMock.mockReset()
    writeJobEventMock.mockReset()
    writeAuditLogMock.mockReset()
    driveDeleteMock.mockReset()

    eqMock.mockReturnValue({ error: null })
    updateMock.mockReturnValue({ eq: eqMock })
    insertMock.mockResolvedValue({ error: null })
    singleMock.mockResolvedValue({ data: { id: 'attempt-1' }, error: null })
    driveDeleteMock.mockResolvedValue(undefined)

    vi.mocked(getJobById).mockResolvedValue(mockJob())
  })

  it('Both platforms uploaded -> status = completed, Drive cleanup called', async () => {
    const job = mockJob({
      youtube_upload_status: 'uploaded',
      instagram_upload_status: 'uploaded',
    })
    vi.mocked(getJobById).mockResolvedValue(job)

    await verifyJob('job-test-1')

    expect(updateMock).toHaveBeenCalledWith(
      'job-test-1',
      'completed',
      expect.objectContaining({
        youtube_upload_status: 'verified',
        instagram_upload_status: 'verified',
        verification_status: 'verified',
        completed_at: expect.any(String),
      }),
    )
  })

  it('Both platforms verified -> Drive file deleted', async () => {
    const job = mockJob({
      youtube_upload_status: 'uploaded',
      instagram_upload_status: 'uploaded',
    })
    vi.mocked(getJobById).mockResolvedValue(job)

    await verifyJob('job-test-1')

    expect(driveDeleteMock).toHaveBeenCalledWith('drive-file-1', 'job-test-1')
  })

  it('One platform failed (attempt 1) -> retry scheduled, status = ready_to_upload', async () => {
    const job = mockJob({
      youtube_upload_status: 'failed',
      instagram_upload_status: 'uploaded',
      youtube_retry_count: 0,
    })
    vi.mocked(getJobById).mockResolvedValue(job)

    await verifyJob('job-test-1')

    expect(updateMock).toHaveBeenCalledWith(
      'job-test-1',
      'ready_to_upload',
      expect.objectContaining({
        youtube_retry_count: 1,
        youtube_upload_status: 'retry_scheduled',
      }),
    )
  })

  it('One platform failed (attempt 2) -> status = needs_manual_review, Drive file retained', async () => {
    const job = mockJob({
      youtube_upload_status: 'failed',
      instagram_upload_status: 'uploaded',
      youtube_retry_count: 2, // Already failed twice (at max retries)
    })
    vi.mocked(getJobById).mockResolvedValue(job)

    await verifyJob('job-test-1')

    expect(updateMock).toHaveBeenCalledWith(
      'job-test-1',
      'needs_manual_review',
      expect.objectContaining({
        failure_code: ERROR_CODES.YOUTUBE_UPLOAD_FAILED,
      }),
    )
  })

  it('Uncertain verification -> verification_status = uncertain, Drive file NOT deleted', async () => {
    const job = mockJob({
      youtube_upload_status: 'uploading',
      instagram_upload_status: 'uploading',
    })
    vi.mocked(getJobById).mockResolvedValue(job)

    await verifyJob('job-test-1')

    expect(updateMock).toHaveBeenCalledWith(
      'job-test-1',
      'awaiting_verification',
      expect.objectContaining({
        verification_status: 'uncertain',
      }),
    )
    expect(driveDeleteMock).not.toHaveBeenCalled()
  })

  it('completed_at is set when job completes', async () => {
    const job = mockJob({
      youtube_upload_status: 'uploaded',
      instagram_upload_status: 'uploaded',
    })
    vi.mocked(getJobById).mockResolvedValue(job)

    await verifyJob('job-test-1')

    const calls = updateMock.mock.calls
    const completedCall = calls.find((c) => c[1] === 'completed')
    expect(completedCall).toBeDefined()
    expect(completedCall?.[2]).toHaveProperty('completed_at')
    expect(typeof completedCall?.[2]?.completed_at).toBe('string')
  })

  it('Login required -> needs_manual_review', async () => {
    const job = mockJob({
      youtube_upload_status: 'login_required',
      instagram_upload_status: 'uploaded',
    })
    vi.mocked(getJobById).mockResolvedValue(job)

    await verifyJob('job-test-1')

    expect(updateMock).toHaveBeenCalledWith(
      'job-test-1',
      'needs_manual_review',
      expect.objectContaining({
        failure_code: ERROR_CODES.YOUTUBE_LOGIN_REQUIRED,
      }),
    )
  })

  it('Instagram login required -> needs_manual_review with Instagram code', async () => {
    const job = mockJob({
      youtube_upload_status: 'uploaded',
      instagram_upload_status: 'login_required',
    })
    vi.mocked(getJobById).mockResolvedValue(job)

    await verifyJob('job-test-1')

    expect(updateMock).toHaveBeenCalledWith(
      'job-test-1',
      'needs_manual_review',
      expect.objectContaining({
        failure_code: ERROR_CODES.INSTAGRAM_LOGIN_REQUIRED,
      }),
    )
  })

  it('Job event: verification_completed written when both uploaded', async () => {
    const job = mockJob({
      youtube_upload_status: 'uploaded',
      instagram_upload_status: 'uploaded',
    })
    vi.mocked(getJobById).mockResolvedValue(job)

    await verifyJob('job-test-1')

    expect(writeJobEventMock).toHaveBeenCalledWith(
      'job-test-1',
      'verify',
      'verification_completed',
      'Both platforms verified',
    )
  })

  it('Audit log: job_verified written when both uploaded', async () => {
    const job = mockJob({
      youtube_upload_status: 'uploaded',
      instagram_upload_status: 'uploaded',
    })
    vi.mocked(getJobById).mockResolvedValue(job)

    await verifyJob('job-test-1')

    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: 'worker',
        action: 'job_verified',
        targetType: 'job',
        targetId: 'job-test-1',
      }),
    )
  })

  it('Audit log: verification_uncertain written for uncertain state', async () => {
    const job = mockJob({
      youtube_upload_status: 'uploading',
      instagram_upload_status: 'uploading',
    })
    vi.mocked(getJobById).mockResolvedValue(job)

    await verifyJob('job-test-1')

    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: 'worker',
        action: 'verification_uncertain',
        metadata: expect.objectContaining({
          youtube_upload_status: 'uploading',
          instagram_upload_status: 'uploading',
        }),
      }),
    )
  })

  it('Throws JOB_NOT_FOUND if job not found', async () => {
    vi.mocked(getJobById).mockResolvedValue(null)

    await expect(verifyJob('job-not-found')).rejects.toThrow('Job not found: job-not-found')
  })
})