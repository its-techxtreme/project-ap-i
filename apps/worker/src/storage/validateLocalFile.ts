import fs from 'node:fs'

import { ERROR_CODES, ProjectApiError } from '@project-api/shared'

/** Ensures a local video file exists and is readable before Drive upload. */
export function assertLocalFileReadable(localFilePath: string): { size: number } {
  try {
    const stat = fs.statSync(localFilePath)
    if (!stat.isFile() || stat.size <= 0) {
      throw new ProjectApiError(
        ERROR_CODES.DRIVE_UPLOAD_FAILED,
        `Local file is empty or not a file: ${localFilePath}`,
        { stage: 'staging_to_drive', retryable: false },
      )
    }
    return { size: stat.size }
  } catch (err: unknown) {
    if (err instanceof ProjectApiError) throw err
    throw new ProjectApiError(
      ERROR_CODES.DRIVE_UPLOAD_FAILED,
      `Local file not found for Drive upload: ${localFilePath}`,
      { stage: 'staging_to_drive', retryable: false },
    )
  }
}
