import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'

import { ERROR_CODES, ProjectApiError } from '@project-api/shared'

import { config } from '../config'
import { logger } from '../logging/logger'

import { classifyDriveError, createDriveApiClient, markDriveAuthFailed } from './driveAuth'
import { buildDriveFileName } from './driveFileName'
import type { DriveStorage, DriveUploadInput, DriveUploadOutput } from './types'
import { assertLocalFileReadable } from './validateLocalFile'

export class GoogleDriveStorage implements DriveStorage {
  private drive: ReturnType<typeof createDriveApiClient> | null = null

  private getDrive() {
    if (!this.drive) {
      this.drive = createDriveApiClient()
    }
    return this.drive
  }

  /** Drop cached client after auth failure so a new token/SA file is picked up. */
  private resetClient(): void {
    this.drive = null
  }

  async upload(input: DriveUploadInput): Promise<DriveUploadOutput> {
    const fileName = buildDriveFileName(input.nicheSlug, input.jobId)
    const folderId = config.GOOGLE_DRIVE_PROCESSED_FOLDER_ID

    if (!folderId) {
      throw new ProjectApiError(
        ERROR_CODES.DRIVE_UPLOAD_FAILED,
        'GOOGLE_DRIVE_PROCESSED_FOLDER_ID is not configured',
        { stage: 'staging_to_drive', retryable: false },
      )
    }

    logger.info({ msg: 'Starting Drive upload', jobId: input.jobId, fileName })

    const UPLOAD_TIMEOUT_MS = 10 * 60_000

    try {
      const { size: fileSize } = assertLocalFileReadable(input.localFilePath)
      const fileStream = fs.createReadStream(input.localFilePath)

      const uploadPromise = this.getDrive().files.create(
        {
          requestBody: {
            name: fileName,
            parents: [folderId],
          },
          media: {
            mimeType: input.mimeType ?? 'video/mp4',
            body: fileStream,
          },
          fields: 'id,name,webViewLink',
          supportsAllDrives: true,
        },
        {
          timeout: UPLOAD_TIMEOUT_MS,
          onUploadProgress: (evt) => {
            if (evt.bytesRead > 0) {
              logger.info({
                msg: 'Drive upload progress',
                jobId: input.jobId,
                bytes: evt.bytesRead,
                total: fileSize,
              })
            }
          },
        },
      )

      const response = await Promise.race([
        uploadPromise,
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            fileStream.destroy()
            reject(new Error(`Drive upload timed out after ${UPLOAD_TIMEOUT_MS}ms`))
          }, UPLOAD_TIMEOUT_MS)
        }),
      ])

      const file = response.data
      if (!file.id || !file.name) {
        throw new ProjectApiError(
          ERROR_CODES.DRIVE_UPLOAD_FAILED,
          'Drive upload succeeded but response missing file id or name',
          { stage: 'staging_to_drive', retryable: true },
        )
      }

      logger.info({ msg: 'Drive upload complete', jobId: input.jobId, fileId: file.id })

      return {
        fileId: file.id,
        fileName: file.name,
        viewUrl: file.webViewLink ?? undefined,
        folderState: 'processed_ready',
      }
    } catch (err: unknown) {
      if (err instanceof ProjectApiError) throw err
      const classified = classifyDriveError(err, 'upload')
      if (classified.code === ERROR_CODES.DRIVE_AUTH_FAILED) {
        this.resetClient()
        markDriveAuthFailed(classified.message)
      }
      throw classified
    }
  }

  async delete(fileId: string, jobId: string): Promise<void> {
    try {
      await this.getDrive().files.delete({ fileId, supportsAllDrives: true })
      logger.info({ msg: 'Drive file deleted', fileId, jobId })
    } catch (err: unknown) {
      throw classifyDriveError(err, 'delete')
    }
  }

  async moveToFailedFolder(fileId: string): Promise<void> {
    const failedFolderId = config.GOOGLE_DRIVE_FAILED_FOLDER_ID
    if (!failedFolderId) return

    try {
      const file = await this.getDrive().files.get({
        fileId,
        fields: 'parents',
        supportsAllDrives: true,
      })
      const prevParents = (file.data.parents ?? []).join(',')
      await this.getDrive().files.update({
        fileId,
        addParents: failedFolderId,
        removeParents: prevParents,
        fields: 'id,parents',
        supportsAllDrives: true,
      })
    } catch (err) {
      logger.warn({ msg: 'Failed to move file to failed folder', fileId, err })
    }
  }

  async downloadToLocal(fileId: string, localFilePath: string, jobId: string): Promise<void> {
    logger.info({ msg: 'Starting Drive download', jobId, fileId, localFilePath })

    try {
      await fs.promises.mkdir(path.dirname(localFilePath), { recursive: true })
      const response = await this.getDrive().files.get(
        { fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'stream' },
      )
      const dest = fs.createWriteStream(localFilePath)
      await pipeline(response.data as NodeJS.ReadableStream, dest)
      assertLocalFileReadable(localFilePath)
      logger.info({ msg: 'Drive download complete', jobId, fileId, localFilePath })
    } catch (err: unknown) {
      if (err instanceof ProjectApiError) throw err
      const classified = classifyDriveError(err, 'download')
      if (classified.code === ERROR_CODES.DRIVE_AUTH_FAILED) {
        this.resetClient()
      }
      throw classified
    }
  }
}
