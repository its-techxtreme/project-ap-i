import fs from 'node:fs/promises'
import path from 'node:path'

import { ERROR_CODES, ProjectApiError } from '@project-api/shared'
import { execa } from 'execa'

import { config } from '../config'
import { logger } from '../logging/logger'

import type { Downloader, DownloadInput, DownloadOutput } from './types'

const MAX_DURATION = config.MAX_SOURCE_DURATION_SECONDS
const MAX_SIZE_MB = config.MAX_SOURCE_FILE_SIZE_MB

export class YtDlpDownloader implements Downloader {
  async download(input: DownloadInput): Promise<DownloadOutput> {
    const outputTemplate = path.join(input.tempDir, 'source.%(ext)s')

    logger.info({ msg: 'Starting yt-dlp download', jobId: input.jobId })

    let result
    try {
      result = await execa('yt-dlp', [
        '--no-playlist',
        '--restrict-filenames',
        '--no-overwrites',
        '-f', 'mp4/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '--merge-output-format', 'mp4',
        '--max-filesize', `${MAX_SIZE_MB}m`,
        '--match-filter', `duration <= ${MAX_DURATION}`,
        '-o', outputTemplate,
        '--print', 'filename',
        '--no-simulate',
        input.sourceUrl,
      ], { timeout: 120_000 })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      const isTimeout = msg.toLowerCase().includes('timed out')
      throw new ProjectApiError(
        isTimeout ? ERROR_CODES.DOWNLOAD_TIMEOUT : ERROR_CODES.DOWNLOAD_FAILED,
        `yt-dlp failed: ${msg}`,
        { stage: 'download', retryable: !isTimeout },
      )
    }

    const localPath = result.stdout.trim()
    if (!localPath) {
      throw new ProjectApiError(
        ERROR_CODES.DOWNLOAD_FAILED,
        'yt-dlp did not return an output file path',
        { stage: 'download', retryable: true },
      )
    }

    let size: number
    try {
      ;({ size } = await fs.stat(localPath))
    } catch {
      throw new ProjectApiError(
        ERROR_CODES.DOWNLOAD_FAILED,
        `Downloaded file not found at: ${localPath}`,
        { stage: 'download', retryable: true },
      )
    }

    logger.info({ msg: 'Download complete', jobId: input.jobId, fileSize: size })
    return { localPath, fileSize: size }
  }
}
