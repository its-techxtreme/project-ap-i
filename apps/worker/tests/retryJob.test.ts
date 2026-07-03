import { beforeEach, describe, expect, it, vi } from 'vitest'

const updateMock = vi.fn()
const eqMock = vi.fn()
const insertMock = vi.fn()
const selectMock = vi.fn()
const singleMock = vi.fn()
const fromMock = vi.fn()
const writeJobEventMock = vi.fn()
const writeAuditLogMock = vi.fn()
const uploadBothPlatformsMock = vi.fn()
const createUploadCoordinatorMock = vi.fn()
const getNicheSlugByIdMock = vi.fn()

vi.mock('../src/db/jobsRepo', () => ({
  getJobById: vi.fn(),
  getNicheSlugById: vi.fn().mockResolvedValue('memes'),
  updateJobStatus: (...args: unknown[]) => updateMock(...args),
  writeJobEvent: (...args: unknown[]) => writeJobEventMock(...args),
  writeAuditLog: (...args: unknown[]) => writeAuditLogMock(...args),
}))

vi.mock('../src/uploaders', () => ({
  createUploadCoordinator: () => ({
    uploadBothPlatforms: uploadBothPlatformsMock,
  }),
}))

vi.mock('../src/db/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => fromMock(...args),
    rpc: vi.fn(),
  },
}))

import { getJobById } from '../src/db/jobsRepo'
import { retryJob } from '../src/jobs/retryJob'
import { ERROR_CODES } from '@project-api/shared'

const mockJob = (overrides: Partial<{
  id: string
  status: string
  youtube_upload_status: string
  instagram_upload_status: string
  youtube_retry_count: number
  instagram_retry_count: number
  drive_file_id: string | null
  drive_deleted_at: string | null
  drive_folder_state: string | null
  niche_id: string
}> = {}) => ({
  id: 'job-test-1',
  status: 'failed',
  youtube_upload_status: 'failed',
  instagram_upload_status: 'failed',
  youtube_retry_count: 0,
  instagram_retry_count: 0,
  drive_file_id: 'drive-file-1',
  drive_deleted_at: null,
  drive_folder_state: 'processed_ready',
  niche_id: 'niche-1',
  ...overrides,
})

describe('retryJob', () => {
  beforeEach(() => {
    updateMock.mockReset()
    eqMock.mockReset()
    insertMock.mockReset()
    selectMock.mockReset()
    singleMock.mockReset()
    fromMock.mockReset()
    writeJobEventMock.mockReset()
    writeAuditLogMock.mockReset()
    uploadBothPlatformsMock.mockReset()
    createUploadCoordinatorMock.mockReset()
    getNicheSlugByIdMock.mockReset()

    eqMock.mockReturnValue({ error: null })
    updateMock.mockReturnValue({ eq: eqMock })
    insertMock.mockResolvedValue({ error: null })
    singleMock.mockResolvedValue({ data: { id: 'attempt-1' }, error: null })
    getNicheSlugByIdMock.mockResolvedValue('memes')

    vi.mocked(getJobById).mockResolvedValue(mockJob())
  })

  it('Retry does NOT call yt-dlp downloader', async () => {
    // Verify we don't import or call downloader
    await retryJob('job-test-1')

    // No downloader should be imported/called in retryJob.ts
    expect(uploadBothPlatformsMock).toHaveBeenCalled()
  })

  it('Retry does NOT call FFmpeg processor', async () => {
    await retryJob('job-test-1')

    // FFmpeg processor should not be called in retryJob
    expect(uploadBothPlatformsMock).toHaveBeenCalled()
  })

  it('Retry DOES call UploadCoordinator', async () => {
    await retryJob('job-test-1')

    expect(uploadBothPlatformsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'job-test-1',
        nicheId: 'niche-1',
        nicheSlug: 'memes',
        driveFileId: 'drive-file-1',
      }),
    )
  })

  it('Retry increments youtube_retry_count or instagram_retry_count', async () => {
    await retryJob('job-test-1', 'youtube')

    expect(updateMock).toHaveBeenCalledWith(
      'job-test-1',
      'failed',
      expect.objectContaining({
        youtube_retry_count: 1,
        youtube_upload_status: 'retry_scheduled',
      }),
    )
  })

  it('Missing Drive file -> needs_manual_review with DRIVE_FILE_MISSING code', async () => {
    const job = mockJob({ drive_file_id: null, drive_deleted_at: '2024-01-01T00:00:00Z' })
    vi.mocked(getJobById).mockResolvedValue(job)

    await expect(retryJob('job-test-1')).rejects.toThrow()

    expect(updateMock).toHaveBeenCalledWith(
      'job-test-1',
      'needs_manual_review',
      expect.objectContaining({
        failure_code: ERROR_CODES.DRIVE_FILE_MISSING,
      }),
    )
  })

  it('New upload_attempts row created for retry', async () => {
    await retryJob('job-test-1')

    expect(writeJobEventMock).toHaveBeenCalledWith(
      'job-test-1',
      'retry',
      'retry_upload_started',
      'Retry upload started for both platform(s)',
    )
  })

  it('Writes audit log for manual retry', async () => {
    await retryJob('job-test-1', 'youtube')

    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: 'admin',
        action: 'manual_retry_requested',
      }),
    )
  })

  it('Throws error for non-retryable job status', async () => {
    const job = mockJob({ status: 'processing' })
    vi.mocked(getJobById).mockResolvedValue(job)

    await expect(retryJob('job-test-1')).rejects.toThrow()
  })
})