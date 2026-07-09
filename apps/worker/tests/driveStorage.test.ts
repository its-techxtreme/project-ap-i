import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { ERROR_CODES, ProjectApiError } from '@project-api/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildDriveFileName } from '../src/storage/driveFileName'
import { MockDriveStorage } from '../src/storage/MockDriveStorage'
import { MockMetadataProvider } from '../src/metadata/MockMetadataProvider'
import { assertLocalFileReadable } from '../src/storage/validateLocalFile'

const updateMock = vi.fn()
const eqMock = vi.fn()
const insertEventMock = vi.fn()
const fromMock = vi.fn()

vi.mock('../src/db/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => fromMock(...args),
    rpc: vi.fn(),
  },
}))

describe('buildDriveFileName', () => {
  it('follows AP-I_<niche>_<jobId>_<timestamp>.mp4 format', () => {
    const date = new Date('2026-06-30T14:05:00')
    expect(buildDriveFileName('memes', 'job-abc-123', date)).toBe(
      'AP-I_memes_job-abc-123_20260630_1405.mp4',
    )
  })
})

describe('assertLocalFileReadable', () => {
  it('returns size for an existing non-empty file', () => {
    const filePath = path.join(__dirname, 'fixtures/sample.mp4')
    const result = assertLocalFileReadable(filePath)
    expect(result.size).toBeGreaterThan(0)
  })

  it('throws DRIVE_UPLOAD_FAILED when file is missing', () => {
    expect(() => assertLocalFileReadable('/tmp/does-not-exist-ap-i.mp4')).toThrow(
      expect.objectContaining({ code: ERROR_CODES.DRIVE_UPLOAD_FAILED }),
    )
  })

  it('throws DRIVE_UPLOAD_FAILED when file is empty', async () => {
    const emptyPath = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'drive-empty-')), 'empty.mp4')
    await fs.writeFile(emptyPath, Buffer.alloc(0))

    expect(() => assertLocalFileReadable(emptyPath)).toThrow(
      expect.objectContaining({ code: ERROR_CODES.DRIVE_UPLOAD_FAILED }),
    )
  })
})

describe('MockDriveStorage', () => {
  let storage: MockDriveStorage

  beforeEach(() => {
    storage = new MockDriveStorage()
  })

  it('upload returns fileId, fileName, and viewUrl', async () => {
    const result = await storage.upload({
      jobId: 'job-1',
      nicheSlug: 'anime',
      localFilePath: '/tmp/fake.mp4',
    })

    expect(result.fileId).toBe('mock-drive-id-job-1')
    expect(result.fileName).toMatch(/^AP-I_anime_job-1_\d{8}_\d{4}\.mp4$/)
    expect(result.viewUrl).toBe('https://drive.google.com/mock/mock-drive-id-job-1')
    expect(result.folderState).toBe('processed_ready')
  })

  it('delete removes the file from internal map', async () => {
    const { fileId } = await storage.upload({
      jobId: 'job-2',
      nicheSlug: 'sports',
      localFilePath: '/tmp/fake.mp4',
    })

    expect(storage.getStoredFiles().has(fileId)).toBe(true)
    await storage.delete(fileId, 'job-2')
    expect(storage.getStoredFiles().has(fileId)).toBe(false)
  })

  it('downloadToLocal copies fixture mp4 to destination', async () => {
    const destDir = await fs.mkdtemp(path.join(os.tmpdir(), 'drive-download-'))
    const destPath = path.join(destDir, 'upload-source.mp4')

    await storage.downloadToLocal('mock-drive-id-job-3', destPath, 'job-3')

    const stat = await fs.stat(destPath)
    expect(stat.size).toBeGreaterThan(0)
  })
})

describe('runProcessPipeline with MockDriveStorage', () => {
  beforeEach(() => {
    updateMock.mockReset()
    eqMock.mockReset()
    insertEventMock.mockReset()
    fromMock.mockReset()

    eqMock.mockReturnValue({ error: null })
    updateMock.mockReturnValue({ eq: eqMock })
    insertEventMock.mockResolvedValue({ error: null })

    fromMock.mockImplementation((table: string) => {
      if (table === 'jobs') return { update: updateMock }
      if (table === 'job_events') return { insert: insertEventMock }
      throw new Error(`Unexpected table: ${table}`)
    })
  })

  it('stores Drive file ID in Supabase and sets status to ready_to_upload', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'drive-pipeline-'))
    const sourcePath = path.join(tempDir, 'source.mp4')
    const outputPath = path.join(tempDir, 'job_job-drive-1_edited.mp4')
    await fs.copyFile(path.join(__dirname, 'fixtures/sample.mp4'), sourcePath)
    await fs.writeFile(outputPath, Buffer.from('edited-video'))

    const driveStorage = new MockDriveStorage()
    const cleanupSpy = vi.fn().mockResolvedValue(undefined)

    const { runProcessPipeline } = await import('../src/jobs/processPipeline')

    const finalStatus = await runProcessPipeline(
      {
        id: 'job-drive-1',
        source_url: 'https://www.youtube.com/watch?v=test',
        source_platform: 'youtube',
        niche_id: 'niche-memes',
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
          download: vi.fn().mockResolvedValue({
            localPath: sourcePath,
            fileSize: 4096,
          }),
        },
        processor: {
          process: vi.fn().mockResolvedValue({
            outputPath,
            fileSize: 8192,
          }),
        },
        driveStorage,
        metadataProvider: new MockMetadataProvider(),
        tempFileManager: {
          createJobDir: vi.fn().mockResolvedValue(tempDir),
          cleanupJobDir: cleanupSpy,
          getOutputPath: vi.fn().mockReturnValue(outputPath),
        },
        getNicheSlug: vi.fn().mockResolvedValue('memes'),
      },
    )

    expect(finalStatus).toBe('ready_to_upload')
    expect(driveStorage.getStoredFiles().has('mock-drive-id-job-drive-1')).toBe(true)

    const readyUpdate = updateMock.mock.calls.find(
      (call) => (call[0] as { status: string }).status === 'ready_to_upload',
    )
    expect(readyUpdate?.[0]).toMatchObject({
      status: 'ready_to_upload',
      drive_file_id: 'mock-drive-id-job-drive-1',
      drive_folder_state: 'processed_ready',
    })
    expect(cleanupSpy).toHaveBeenCalledWith('job-drive-1')

    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it('marks job failed and cleans temp when Drive upload fails', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'drive-fail-'))
    const sourcePath = path.join(tempDir, 'source.mp4')
    const outputPath = path.join(tempDir, 'job_job-drive-fail_edited.mp4')
    await fs.writeFile(sourcePath, Buffer.from('source'))
    await fs.writeFile(outputPath, Buffer.from('edited'))

    const driveStorage = {
      upload: vi.fn().mockRejectedValue(
        new ProjectApiError(ERROR_CODES.DRIVE_UPLOAD_FAILED, 'Drive upload failed: network', {
          stage: 'staging_to_drive',
          retryable: true,
        }),
      ),
      delete: vi.fn(),
      moveToFailedFolder: vi.fn(),
    }
    const cleanupSpy = vi.fn().mockResolvedValue(undefined)

    const { runProcessPipeline } = await import('../src/jobs/processPipeline')

    await expect(
      runProcessPipeline(
        {
          id: 'job-drive-fail',
          source_url: 'https://www.youtube.com/watch?v=test',
          source_platform: 'youtube',
          niche_id: 'niche-memes',
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
          driveStorage,
          tempFileManager: {
            createJobDir: vi.fn().mockResolvedValue(tempDir),
            cleanupJobDir: cleanupSpy,
            getOutputPath: vi.fn().mockReturnValue(outputPath),
          },
          getNicheSlug: vi.fn().mockResolvedValue('memes'),
        },
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.DRIVE_UPLOAD_FAILED })

    expect(cleanupSpy).toHaveBeenCalledWith('job-drive-fail')
    expect(driveStorage.delete).not.toHaveBeenCalled()

    const failedUpdate = updateMock.mock.calls.find(
      (call) => (call[0] as { status: string }).status === 'failed',
    )
    expect(failedUpdate?.[0]).toMatchObject({
      status: 'failed',
      failure_code: ERROR_CODES.DRIVE_UPLOAD_FAILED,
      failure_reason: 'Drive upload failed: network',
    })

    await fs.rm(tempDir, { recursive: true, force: true })
  })
})
