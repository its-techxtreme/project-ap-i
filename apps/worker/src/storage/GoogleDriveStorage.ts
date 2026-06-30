import fs from 'node:fs'

import { ERROR_CODES, ProjectApiError } from '@project-api/shared'
import { google } from 'googleapis'

import { config } from '../config'
import { logger } from '../logging/logger'

import { buildDriveFileName } from './driveFileName'
import type { DriveStorage, DriveUploadInput, DriveUploadOutput } from './types'
import { assertLocalFileReadable } from './validateLocalFile'

function buildDriveClient() {
  const clientId = config.GOOGLE_DRIVE_CLIENT_ID
  const clientSecret = config.GOOGLE_DRIVE_CLIENT_SECRET
  const refreshToken = config.GOOGLE_DRIVE_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) {
    throw new ProjectApiError(
      ERROR_CODES.DRIVE_UPLOAD_FAILED,
      'Google Drive credentials are not configured',
      { stage: 'staging_to_drive', retryable: false },
    )
  }

  const auth = new google.auth.OAuth2(clientId, clientSecret)
  auth.setCredentials({ refresh_token: refreshToken })
  return google.drive({ version: 'v3', auth })
}

export class GoogleDriveStorage implements DriveStorage {
  private drive: ReturnType<typeof google.drive> | null = null

  private getDrive() {
    if (!this.drive) {
      this.drive = buildDriveClient()
    }
    return this.drive
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

    try {
      const { size: fileSize } = assertLocalFileReadable(input.localFilePath)
      const fileStream = fs.createReadStream(input.localFilePath)

      const response = await this.getDrive().files.create(
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
        },
        {
          onUploadProgress: (evt) => {
            if (evt.bytesRead > 0 && evt.bytesRead % (10 * 1024 * 1024) === 0) {
              logger.debug({
                msg: 'Drive upload progress',
                jobId: input.jobId,
                bytes: evt.bytesRead,
                total: fileSize,
              })
            }
          },
        },
      )

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
      const msg = err instanceof Error ? err.message : String(err)
      throw new ProjectApiError(ERROR_CODES.DRIVE_UPLOAD_FAILED, `Drive upload failed: ${msg}`, {
        stage: 'staging_to_drive',
        retryable: true,
      })
    }
  }

  async delete(fileId: string, jobId: string): Promise<void> {
    try {
      await this.getDrive().files.delete({ fileId })
      logger.info({ msg: 'Drive file deleted', fileId, jobId })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new ProjectApiError(ERROR_CODES.DRIVE_DELETE_FAILED, `Drive delete failed: ${msg}`)
    }
  }

  async moveToFailedFolder(fileId: string): Promise<void> {
    const failedFolderId = config.GOOGLE_DRIVE_FAILED_FOLDER_ID
    if (!failedFolderId) return

    try {
      const file = await this.getDrive().files.get({ fileId, fields: 'parents' })
      const prevParents = (file.data.parents ?? []).join(',')
      await this.getDrive().files.update({
        fileId,
        addParents: failedFolderId,
        removeParents: prevParents,
        fields: 'id,parents',
      })
    } catch (err) {
      logger.warn({ msg: 'Failed to move file to failed folder', fileId, err })
    }
  }
}
