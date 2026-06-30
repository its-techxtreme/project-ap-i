import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { ERROR_CODES, ProjectApiError } from '@project-api/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MockDriveStorage } from '../src/storage/MockDriveStorage'
import { MockMetadataProvider } from '../src/metadata/MockMetadataProvider'

const updateMock = vi.fn()
const eqMock = vi.fn()
const insertAuditMock = vi.fn()
const getJobMock = vi.fn()
const fromMock = vi.fn()

vi.mock('../src/db/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => fromMock(...args),
    rpc: vi.fn(),
  },
}))

describe('drive cleanup and delete', () => {
  beforeEach(() => {
    updateMock.mockReset()
    eqMock.mockReset()
    insertAuditMock.mockReset()
    getJobMock.mockReset()
    fromMock.mockReset()

    eqMock.mockReturnValue({ error: null })
    updateMock.mockReturnValue({ eq: eqMock })
    insertAuditMock.mockResolvedValue({ error: null })

    fromMock.mockImplementation((table: string) => {
      if (table === 'jobs') {
        return {
          update: updateMock,
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: getJobMock,
            }),
          }),
        }
      }
      if (table === 'audit_logs') return { insert: insertAuditMock }
      if (table === 'job_events') return { insert: vi.fn().mockResolvedValue({ error: null }) }
      throw new Error(`Unexpected table: ${table}`)
    })
  })

  it('deletes local temp files after successful Drive upload', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'drive-cleanup-'))
    const sourcePath = path.join(tempDir, 'source.mp4')
    const outputPath = path.join(tempDir, 'job_job-temp-1_edited.mp4')
    await fs.copyFile(path.join(__dirname, 'fixtures/sample.mp4'), sourcePath)
    await fs.writeFile(outputPath, Buffer.from('edited'))

    const cleanupSpy = vi.fn().mockResolvedValue(undefined)
    const { runProcessPipeline } = await import('../src/jobs/processPipeline')

    await runProcessPipeline(
      {
        id: 'job-temp-1',
        source_url: 'https://www.youtube.com/watch?v=test',
        source_platform: 'youtube',
        niche_id: 'niche-1',
        rights_confirmed: true,
        status: 'queued',
        download_status: 'pending',
        processing_status: 'pending',
        metadata_status: 'pending',
        youtube_upload_status: 'pending',
        instagram_upload_status: 'pending',
        verification_status: 'pending',
        retry_count: 0,
        youtube_retry_count: 0,
        instagram_retry_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        downloader: {
          download: vi.fn().mockResolvedValue({ localPath: sourcePath, fileSize: 100 }),
        },
        processor: {
          process: vi.fn().mockResolvedValue({ outputPath, fileSize: 200 }),
        },
        driveStorage: new MockDriveStorage(),
        metadataProvider: new MockMetadataProvider(),
        tempFileManager: {
          createJobDir: vi.fn().mockResolvedValue(tempDir),
          cleanupJobDir: cleanupSpy,
          getOutputPath: vi.fn().mockReturnValue(outputPath),
        },
        getNicheSlug: vi.fn().mockResolvedValue('sports'),
      },
    )

    expect(cleanupSpy).toHaveBeenCalledOnce()
    expect(cleanupSpy).toHaveBeenCalledWith('job-temp-1')

    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it('does not auto-delete Drive file for twice-failed jobs', async () => {
    const { shouldRetainDriveFile } = await import('../src/jobs/driveDelete')

    const driveStorage = new MockDriveStorage()
    await driveStorage.upload({
      jobId: 'job-failed-2x',
      nicheSlug: 'memes',
      localFilePath: '/tmp/fake.mp4',
    })

    const deleteSpy = vi.spyOn(driveStorage, 'delete')

    expect(
      shouldRetainDriveFile({
        id: 'job-failed-2x',
        source_url: 'https://www.youtube.com/watch?v=x',
        source_platform: 'youtube',
        niche_id: 'niche-1',
        rights_confirmed: true,
        status: 'needs_manual_review',
        download_status: 'succeeded',
        processing_status: 'succeeded',
        metadata_status: 'pending',
        youtube_upload_status: 'failed',
        instagram_upload_status: 'failed',
        verification_status: 'pending',
        retry_count: 2,
        youtube_retry_count: 2,
        instagram_retry_count: 2,
        drive_file_id: 'mock-drive-id-job-failed-2x',
        drive_folder_state: 'processed_ready',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    ).toBe(true)

    expect(deleteSpy).not.toHaveBeenCalled()
    expect(driveStorage.getStoredFiles().has('mock-drive-id-job-failed-2x')).toBe(true)
  })

  it('deleteJobDriveFile updates drive_folder_state to deleted', async () => {
    getJobMock.mockResolvedValue({
      data: {
        id: 'job-del-1',
        status: 'failed',
        drive_file_id: 'drive-file-123',
        drive_folder_state: 'processed_ready',
      },
      error: null,
    })

    const driveStorage = {
      delete: vi.fn().mockResolvedValue(undefined),
      upload: vi.fn(),
      moveToFailedFolder: vi.fn(),
    }

    const { deleteJobDriveFile } = await import('../src/jobs/driveDelete')
    await deleteJobDriveFile('job-del-1', driveStorage)

    expect(driveStorage.delete).toHaveBeenCalledWith('drive-file-123', 'job-del-1')
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        drive_folder_state: 'deleted',
        drive_deleted_at: expect.any(String),
      }),
    )
  })

  it('deleteJobDriveFile writes audit log entry', async () => {
    getJobMock.mockResolvedValue({
      data: {
        id: 'job-del-2',
        status: 'needs_manual_review',
        drive_file_id: 'drive-file-456',
        drive_folder_state: 'processed_ready',
      },
      error: null,
    })

    const driveStorage = {
      delete: vi.fn().mockResolvedValue(undefined),
      upload: vi.fn(),
      moveToFailedFolder: vi.fn(),
    }

    const { deleteJobDriveFile } = await import('../src/jobs/driveDelete')
    await deleteJobDriveFile('job-del-2', driveStorage)

    expect(insertAuditMock).toHaveBeenCalledWith({
      actor_type: 'worker',
      action: 'drive_deleted',
      target_type: 'job',
      target_id: 'job-del-2',
      metadata: { drive_file_id: 'drive-file-456' },
    })
  })

  it('deleteJobDriveFile is idempotent when drive file already marked deleted', async () => {
    getJobMock.mockResolvedValue({
      data: {
        id: 'job-del-idempotent',
        status: 'completed',
        drive_file_id: 'drive-file-done',
        drive_folder_state: 'deleted',
      },
      error: null,
    })

    const driveStorage = {
      delete: vi.fn(),
      upload: vi.fn(),
      moveToFailedFolder: vi.fn(),
    }

    const { deleteJobDriveFile } = await import('../src/jobs/driveDelete')
    const result = await deleteJobDriveFile('job-del-idempotent', driveStorage)

    expect(result.driveFileId).toBe('drive-file-done')
    expect(driveStorage.delete).not.toHaveBeenCalled()
    expect(insertAuditMock).not.toHaveBeenCalled()
  })

  it('deleteJobDriveFile rejects queued and processing statuses', async () => {
    const { deleteJobDriveFile } = await import('../src/jobs/driveDelete')
    const driveStorage = new MockDriveStorage()

    for (const status of ['queued', 'processing'] as const) {
      getJobMock.mockResolvedValue({
        data: {
          id: 'job-blocked',
          status,
          drive_file_id: 'drive-file-789',
        },
        error: null,
      })

      await expect(deleteJobDriveFile('job-blocked', driveStorage)).rejects.toMatchObject({
        code: ERROR_CODES.DRIVE_DELETE_FAILED,
      })
    }
  })

  it('deleteJobDriveFile throws DRIVE_DELETE_FAILED when Drive delete fails', async () => {
    getJobMock.mockResolvedValue({
      data: {
        id: 'job-del-fail',
        status: 'completed',
        drive_file_id: 'drive-file-fail',
        drive_folder_state: 'processed_ready',
      },
      error: null,
    })

    const driveStorage = {
      delete: vi.fn().mockRejectedValue(
        new ProjectApiError(ERROR_CODES.DRIVE_DELETE_FAILED, 'Drive delete failed: API error'),
      ),
      upload: vi.fn(),
      moveToFailedFolder: vi.fn(),
    }

    const { deleteJobDriveFile } = await import('../src/jobs/driveDelete')

    await expect(deleteJobDriveFile('job-del-fail', driveStorage)).rejects.toMatchObject({
      code: ERROR_CODES.DRIVE_DELETE_FAILED,
    })
  })
})

describe('delete-drive-file endpoint', () => {
  beforeEach(() => {
    updateMock.mockReset()
    eqMock.mockReset()
    insertAuditMock.mockReset()
    getJobMock.mockReset()
    fromMock.mockReset()

    eqMock.mockReturnValue({ error: null })
    updateMock.mockReturnValue({ eq: eqMock })
    insertAuditMock.mockResolvedValue({ error: null })

    fromMock.mockImplementation((table: string) => {
      if (table === 'jobs') {
        return {
          update: updateMock,
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ single: getJobMock }),
          }),
        }
      }
      if (table === 'audit_logs') return { insert: insertAuditMock }
      if (table === 'job_events') return { insert: vi.fn().mockResolvedValue({ error: null }) }
      throw new Error(`Unexpected table: ${table}`)
    })

    vi.doMock('../src/db/supabaseAdmin', () => ({
      supabaseAdmin: { from: (...args: unknown[]) => fromMock(...args), rpc: vi.fn() },
    }))
  })

  it('returns 400 when job status is queued', async () => {
    getJobMock.mockResolvedValue({
      data: { id: 'job-api-1', status: 'queued', drive_file_id: 'drive-1' },
      error: null,
    })

    vi.doMock('../src/storage/index', () => ({
      createDriveStorage: () => new MockDriveStorage(),
    }))

    const { buildServer } = await import('../src/server')
    const app = await buildServer()

    const response = await app.inject({
      method: 'POST',
      url: '/jobs/job-api-1/delete-drive-file',
      headers: { 'x-worker-token': 'test-worker-internal-token-min-32-chars' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().code).toBe(ERROR_CODES.DRIVE_DELETE_FAILED)
  })

  it('returns success for failed job with Drive file', async () => {
    getJobMock.mockResolvedValue({
      data: {
        id: 'job-api-2',
        status: 'failed',
        drive_file_id: 'mock-drive-id-job-api-2',
        drive_folder_state: 'processed_ready',
      },
      error: null,
    })

    const { buildServer } = await import('../src/server')
    const app = await buildServer()

    const response = await app.inject({
      method: 'POST',
      url: '/jobs/job-api-2/delete-drive-file',
      headers: { 'x-worker-token': 'test-worker-internal-token-min-32-chars' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      success: true,
      jobId: 'job-api-2',
      driveFileId: 'mock-drive-id-job-api-2',
    })
  })
})
