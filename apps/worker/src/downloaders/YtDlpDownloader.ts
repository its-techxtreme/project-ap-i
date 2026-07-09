import fs from 'node:fs/promises'
import path from 'node:path'

import { ERROR_CODES, ProjectApiError } from '@project-api/shared'

import { config } from '../config'
import { logger } from '../logging/logger'
import { runCommand } from '../utils/runCommand'

import type { Downloader, DownloadInput, DownloadOutput } from './types'

const MAX_DURATION = config.MAX_SOURCE_DURATION_SECONDS
const MAX_SIZE_MB = config.MAX_SOURCE_FILE_SIZE_MB

async function resolveDownloadedPath(tempDir: string, printed: string): Promise<string | null> {
  const candidates = printed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reverse()

  for (const candidate of candidates) {
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      // try next
    }
  }

  const entries = await fs.readdir(tempDir)
  const sourceFile = entries.find((name) => name.startsWith('source.'))
  if (!sourceFile) return null
  return path.join(tempDir, sourceFile)
}

async function probeDurationSeconds(filePath: string): Promise<number | null> {
  try {
    const result = await runCommand(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        filePath,
      ],
      { timeout: 30_000 },
    )
    const value = Number.parseFloat(result.stdout.trim())
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

export class YtDlpDownloader implements Downloader {
  async download(input: DownloadInput): Promise<DownloadOutput> {
    const outputTemplate = path.join(input.tempDir, 'source.%(ext)s')

    logger.info({ msg: 'Starting yt-dlp download', jobId: input.jobId })

    // Do NOT use yt-dlp --match-filter for duration: Instagram often lacks
    // duration in pre-download metadata, which silently skips the download.
    let result
    try {
      result = await runCommand(
        'yt-dlp',
        [
          '--no-playlist',
          '--restrict-filenames',
          '--no-overwrites',
          '-f',
          'mp4/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
          '--merge-output-format',
          'mp4',
          '--max-filesize',
          `${MAX_SIZE_MB}m`,
          '-o',
          outputTemplate,
          '--print',
          'filename',
          '--no-simulate',
          '--no-progress',
          input.sourceUrl,
        ],
        { timeout: 180_000 },
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      const isTimeout = msg.toLowerCase().includes('timed out')
      throw new ProjectApiError(
        isTimeout ? ERROR_CODES.DOWNLOAD_TIMEOUT : ERROR_CODES.DOWNLOAD_FAILED,
        `yt-dlp failed: ${msg}`,
        { stage: 'download', retryable: !isTimeout },
      )
    }

    const localPath = await resolveDownloadedPath(input.tempDir, result.stdout)
    if (!localPath) {
      logger.error({
        msg: 'yt-dlp produced no output file',
        jobId: input.jobId,
        stdout: result.stdout.slice(0, 500),
        stderr: result.stderr.slice(0, 500),
      })
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

    const duration = await probeDurationSeconds(localPath)
    if (duration !== null && duration > MAX_DURATION) {
      throw new ProjectApiError(
        ERROR_CODES.DOWNLOAD_FAILED,
        `Source duration ${duration.toFixed(1)}s exceeds limit of ${MAX_DURATION}s`,
        { stage: 'download', retryable: false },
      )
    }

    logger.info({
      msg: 'Download complete',
      jobId: input.jobId,
      fileSize: size,
      durationSeconds: duration,
      localPath,
    })
    return { localPath, fileSize: size }
  }
}
