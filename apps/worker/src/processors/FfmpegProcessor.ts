import fs from 'node:fs/promises'
import path from 'node:path'

import { ERROR_CODES, ProjectApiError } from '@project-api/shared'

import { logger } from '../logging/logger'
import { runCommand } from '../utils/runCommand'

import { OUTPUT_HEIGHT, OUTPUT_WIDTH, buildFfmpegArgs } from './EditPreset'
import { probeVideoDimensions, sourceHasAudio } from './probeMedia'
import type { ProcessInput, ProcessOutput, Processor } from './types'

export class FfmpegProcessor implements Processor {
  async process(input: ProcessInput): Promise<ProcessOutput> {
    try {
      await fs.access(input.sourcePath)
    } catch {
      throw new ProjectApiError(
        ERROR_CODES.FFMPEG_FAILED,
        `Source video not found at: ${input.sourcePath}`,
        { stage: 'processing', retryable: false },
      )
    }

    try {
      await fs.access(input.backgroundMusicPath)
    } catch {
      throw new ProjectApiError(
        ERROR_CODES.BACKGROUND_MUSIC_MISSING,
        `Background music not found at: ${input.backgroundMusicPath}`,
        { stage: 'processing' },
      )
    }

    const outputPath = path.join(input.tempDir, `job_${input.jobId}_edited.mp4`)
    const hasAudio = await sourceHasAudio(input.sourcePath)

    logger.info({
      msg: 'Starting FFmpeg processing',
      jobId: input.jobId,
      hasAudio,
      backgroundMusicPath: input.backgroundMusicPath,
    })

    const args = buildFfmpegArgs({
      inputPath: input.sourcePath,
      outputPath,
      backgroundMusicPath: input.backgroundMusicPath,
      hasAudio,
    })

    try {
      await runCommand('ffmpeg', args, { timeout: 600_000 })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new ProjectApiError(ERROR_CODES.FFMPEG_FAILED, `FFmpeg failed: ${msg}`, {
        stage: 'processing',
        retryable: false,
      })
    }

    const dims = await probeVideoDimensions(outputPath)
    if (!dims || dims.width !== OUTPUT_WIDTH || dims.height !== OUTPUT_HEIGHT) {
      const got = dims ? `${dims.width}x${dims.height}` : 'unknown'
      throw new ProjectApiError(
        ERROR_CODES.FFMPEG_FAILED,
        `FFmpeg output must be ${OUTPUT_WIDTH}x${OUTPUT_HEIGHT} vertical Shorts/Reels (got ${got})`,
        { stage: 'processing', retryable: false },
      )
    }

    const { size } = await fs.stat(outputPath)
    logger.info({
      msg: 'FFmpeg processing complete',
      jobId: input.jobId,
      outputSize: size,
      width: dims.width,
      height: dims.height,
    })

    return { outputPath, fileSize: size }
  }
}
