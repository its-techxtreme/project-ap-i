import fs from 'node:fs/promises'
import path from 'node:path'

import { ERROR_CODES, ProjectApiError } from '@project-api/shared'

import { logger } from '../logging/logger'
import { runCommand } from '../utils/runCommand'

import { sourceHasAudio } from './probeMedia'
import { buildFfmpegArgs } from './WatermarkPreset'
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
      await fs.access(input.watermarkPath)
    } catch {
      throw new ProjectApiError(
        ERROR_CODES.WATERMARK_MISSING,
        `Watermark not found at: ${input.watermarkPath}`,
        { stage: 'processing' },
      )
    }

    const outputPath = path.join(input.tempDir, `job_${input.jobId}_edited.mp4`)
    const hasAudio = await sourceHasAudio(input.sourcePath)

    logger.info({ msg: 'Starting FFmpeg processing', jobId: input.jobId, hasAudio })

    const args = buildFfmpegArgs({
      inputPath: input.sourcePath,
      outputPath,
      watermarkPath: input.watermarkPath,
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

    const { size } = await fs.stat(outputPath)
    logger.info({ msg: 'FFmpeg processing complete', jobId: input.jobId, outputSize: size })

    return { outputPath, fileSize: size }
  }
}
