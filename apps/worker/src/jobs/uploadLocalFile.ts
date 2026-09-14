import path from 'node:path'

import { config } from '../config'
import { createDriveStorage } from '../storage'

import { TempFileManager } from './TempFileManager'

export function needsLocalUploadFile(): boolean {
  return (
    config.REAL_UPLOADS_ENABLED &&
    (config.YOUTUBE_UPLOADS_ENABLED || config.INSTAGRAM_UPLOADS_ENABLED)
  )
}

/** Pull staged Drive file to disk for Playwright. Cleanup callback after. */
export async function prepareLocalUploadFile(
  jobId: string,
  driveFileId: string,
): Promise<{ localFilePath?: string; cleanup: () => Promise<void> }> {
  if (!needsLocalUploadFile()) {
    return { cleanup: async () => undefined }
  }

  const tempManager = new TempFileManager()
  const jobDir = await tempManager.createJobDir(jobId)
  const localFilePath = path.join(jobDir, 'upload-source.mp4')
  const driveStorage = createDriveStorage()
  await driveStorage.downloadToLocal(driveFileId, localFilePath, jobId)

  return {
    localFilePath,
    cleanup: () => tempManager.cleanupJobDir(jobId),
  }
}
