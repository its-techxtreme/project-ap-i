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
const createDriveStorageMock = vi.fn()

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
import { cleanupJob } from '../src/jobs/cleanupJob'

const mockJob = (overrides: Partial<{
  id: string
  status: string
  youtube_upload_status: string
  instagram_upload_status: string
  drive_file_id: string | null
  drive_deleted_at: string | null
  drive_folder_state: string | null
  niche_id: string
}> = {}) => ({
  id: 'job-test-1',
  status: 'completed',
  youtube_upload_status: 'verified',
  instagram_upload_status: 'verified',
  drive_file_id: 'drive-file-1',
  drive_deleted_at: null,
  drive_folder_state: 'processed_ready',
  niche_id: 'niche-1',
  ...overrides,
})

describe('cleanupJob', () => {
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
    createDriveStorageMock.mockReset()

    eqMock.mockReturnValue({ error: null })
    updateMock.mockReturnValue({ eq: eqMock })
    insertMock.mockResolvedValue({ error: null })
    singleMock.mockResolvedValue({ data: { id: 'attempt-1' }, error: null })
    driveDeleteMock.mockResolvedValue(undefined)

    vi.mocked(getJobById).mockResolvedValue(mockJob())
  })

  it('Drive delete called with correct fileId', async () => {
    const result = await cleanupJob('job-test-1')

    expect(driveDeleteMock).toHaveBeenCalledWith('drive-file-1', 'job-test-1')
    expect(result).toEqual({ driveFileId: 'drive-file-1' })
  })

  it('drive_folder_state = deleted after cleanup', async () => {
    await cleanupJob('job-test-1')

    expect(updateMock).toHaveBeenCalledWith(
      'job-test-1',
      'completed',
      expect.objectContaining({
        drive_folder_state: 'deleted',
      }),
    )
  })

  it('drive_deleted_at timestamp set', async () => {
    await cleanupJob('job-test-1')

    const calls = updateMock.mock.calls
    const completedCall = calls.find((c) => c[1] === 'completed')
    expect(completedCall).toBeDefined()
    expect(completedCall?.[2]).toHaveProperty('drive_deleted_at')
    expect(typeof completedCall?.[2]?.drive_deleted_at).toBe('string')
  })

  it('Audit log written: action = drive_deleted', async () => {
    await cleanupJob('job-test-1')

    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: 'worker',
        action: 'drive_deleted',
        targetType: 'job',
        targetId: 'job-test-1',
        metadata: { drive_file_id: 'drive-file-1' },
      }),
    )
  })

  it('Job event written: drive_deleted', async () => {
    await cleanupJob('job-test-1')

    expect(writeJobEventMock).toHaveBeenCalledWith(
      'job-test-1',
      'cleanup',
      'drive_deleted',
      'Drive file deleted after successful verification',
    )
  })

  it('Throws error if YouTube not verified', async () => {
    const job = mockJob({ youtube_upload_status: 'uploaded', instagram_upload_status: 'verified' })
    vi.mocked(getJobById).mockResolvedValue(job)

    await expect(cleanupJob('job-test-1')).rejects.toThrow(
      'Cannot cleanup: YouTube verified=false, Instagram verified=true',
    )
  })

  it('Throws error if Instagram not verified', async () => {
    const job = mockJob({ youtube_upload_status: 'verified', instagram_upload_status: 'uploaded' })
    vi.mocked(getJobById).mockResolvedValue(job)

    await expect(cleanupJob('job-test-1')).rejects.toThrow(
      'Cannot cleanup: YouTube verified=true, Instagram verified=false',
    )
  })

  it('Throws error if no drive_file_id', async () => {
    const job = mockJob({ drive_file_id: null })
    vi.mocked(getJobById).mockResolvedValue(job)

    await expect(cleanupJob('job-test-1')).rejects.toThrow('Job job-test-1 has no Drive file to cleanup')
  })

  it('Returns early if already deleted', async () => {
    const job = mockJob({ drive_folder_state: 'deleted' })
    vi.mocked(getJobById).mockResolvedValue(job)

    const result = await cleanupJob('job-test-1')

    expect(driveDeleteMock).not.toHaveBeenCalled()
    expect(result).toEqual({ driveFileId: 'drive-file-1' })
  })
})