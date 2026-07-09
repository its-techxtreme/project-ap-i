import { beforeEach, describe, expect, it, vi } from 'vitest'

const claimMock = vi.fn()
const markDoneMock = vi.fn()
const markFailedMock = vi.fn()
const retryJobMock = vi.fn()
const deleteDriveMock = vi.fn()
const writeEventMock = vi.fn()
const createDriveMock = vi.fn(() => ({ kind: 'mock-drive' }))

vi.mock('../src/db/adminCommandsRepo', () => ({
  claimNextAdminCommand: (...args: unknown[]) => claimMock(...args),
  markAdminCommandDone: (...args: unknown[]) => markDoneMock(...args),
  markAdminCommandFailed: (...args: unknown[]) => markFailedMock(...args),
}))

vi.mock('../src/jobs/retryJob', () => ({
  retryJob: (...args: unknown[]) => retryJobMock(...args),
}))

vi.mock('../src/jobs/driveDelete', () => ({
  deleteJobDriveFile: (...args: unknown[]) => deleteDriveMock(...args),
}))

vi.mock('../src/db/jobsRepo', () => ({
  writeJobEvent: (...args: unknown[]) => writeEventMock(...args),
}))

vi.mock('../src/storage', () => ({
  createDriveStorage: () => createDriveMock(),
}))

vi.mock('../src/logging/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

describe('processNextAdminCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('returns processed:false when outbox is empty', async () => {
    claimMock.mockResolvedValueOnce(null)
    const { processNextAdminCommand } = await import('../src/jobs/processAdminCommand')
    await expect(processNextAdminCommand('worker-1')).resolves.toEqual({ processed: false })
  })

  it('executes retry_upload and marks done', async () => {
    claimMock.mockResolvedValueOnce({
      id: 'cmd-1',
      job_id: 'job-1',
      command: 'retry_upload',
      payload: { platform: 'both' },
    })
    retryJobMock.mockResolvedValueOnce(undefined)
    markDoneMock.mockResolvedValueOnce(undefined)

    const { processNextAdminCommand } = await import('../src/jobs/processAdminCommand')
    const result = await processNextAdminCommand('worker-1')

    expect(retryJobMock).toHaveBeenCalledWith('job-1', undefined)
    expect(markDoneMock).toHaveBeenCalledWith('cmd-1')
    expect(result).toEqual({
      processed: true,
      commandId: 'cmd-1',
      jobId: 'job-1',
      command: 'retry_upload',
      success: true,
    })
  })

  it('executes delete_drive_file and marks done', async () => {
    claimMock.mockResolvedValueOnce({
      id: 'cmd-2',
      job_id: 'job-2',
      command: 'delete_drive_file',
      payload: {},
    })
    deleteDriveMock.mockResolvedValueOnce({ driveFileId: 'drive-1' })
    markDoneMock.mockResolvedValueOnce(undefined)

    const { processNextAdminCommand } = await import('../src/jobs/processAdminCommand')
    const result = await processNextAdminCommand('worker-1')

    expect(deleteDriveMock).toHaveBeenCalledWith('job-2', { kind: 'mock-drive' })
    expect(result.success).toBe(true)
    expect(result.command).toBe('delete_drive_file')
  })

  it('marks failed when execution throws', async () => {
    claimMock.mockResolvedValueOnce({
      id: 'cmd-3',
      job_id: 'job-3',
      command: 'retry_upload',
      payload: {},
    })
    retryJobMock.mockRejectedValueOnce(new Error('upload boom'))
    markFailedMock.mockResolvedValueOnce(undefined)

    const { processNextAdminCommand } = await import('../src/jobs/processAdminCommand')
    const result = await processNextAdminCommand('worker-1')

    expect(markFailedMock).toHaveBeenCalledWith('cmd-3', 'upload boom')
    expect(result).toEqual({
      processed: true,
      commandId: 'cmd-3',
      jobId: 'job-3',
      command: 'retry_upload',
      success: false,
      error: 'upload boom',
    })
  })
})
