import path from 'node:path'

import { logger } from '../logging/logger'

import { buildDriveFileName } from './driveFileName'
import type { DriveStorage, DriveUploadInput, DriveUploadOutput } from './types'

export class MockDriveStorage implements DriveStorage {
  private readonly files: Map<string, { fileName: string; jobId: string }> = new Map()

  async upload(input: DriveUploadInput): Promise<DriveUploadOutput> {
    const fileId = `mock-drive-id-${input.jobId}`
    const fileName = buildDriveFileName(input.nicheSlug, input.jobId)
    this.files.set(fileId, { fileName, jobId: input.jobId })
    logger.info({ msg: '[MOCK] Drive upload', jobId: input.jobId, fileId })
    return {
      fileId,
      fileName,
      viewUrl: `https://drive.google.com/mock/${fileId}`,
      folderState: 'processed_ready',
    }
  }

  async delete(fileId: string, jobId: string): Promise<void> {
    this.files.delete(fileId)
    logger.info({ msg: '[MOCK] Drive delete', fileId, jobId })
  }

  async moveToFailedFolder(fileId: string): Promise<void> {
    logger.info({ msg: '[MOCK] Drive move to failed folder', fileId })
  }

  async downloadToLocal(fileId: string, localFilePath: string, jobId: string): Promise<void> {
    const fs = await import('node:fs/promises')
    const fixturePath = path.join(__dirname, '../../tests/fixtures/sample.mp4')
    await fs.mkdir(path.dirname(localFilePath), { recursive: true })
    await fs.copyFile(fixturePath, localFilePath)
    logger.info({ msg: '[MOCK] Drive download', fileId, jobId, localFilePath })
  }

  getStoredFiles(): Map<string, { fileName: string; jobId: string }> {
    return this.files
  }
}
