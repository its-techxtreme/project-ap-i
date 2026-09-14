import fs from 'node:fs/promises'
import path from 'node:path'

import { ERROR_CODES, ProjectApiError } from '@project-api/shared'

import { logger } from '../logging/logger'
import { runCommand } from '../utils/runCommand'
import { writeJobEvent } from '../db/jobsRepo'

import { detectHardCaptions } from './detectHardCaptions'
import {
  buildYoutubeBrandDrawtextFilter,
  youtubeBrandLabelForNiche,
  type ContentCrop,
} from './youtubeBrandCText'

const FONT_CANDIDATES = [
  process.env.FFMPEG_DRAWTEXT_FONT,
  'C:/Windows/Fonts/arialbd.ttf',
  'C:/Windows/Fonts/arial.ttf',
  'C:/Windows/Fonts/segoeui.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
  '/System/Library/Fonts/Supplemental/Arial.ttf',
].filter((p): p is string => Boolean(p && p.trim()))

async function resolveDrawtextFont(): Promise<string | undefined> {
  for (const candidate of FONT_CANDIDATES) {
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      // missing, try the next font path
    }
  }
  return undefined
}

export function buildYoutubeBrandOverlayArgs(opts: {
  inputPath: string
  outputPath: string
  label: string
  fontFile?: string
  contentCrop?: ContentCrop | null
}): string[] {
  const drawtext = buildYoutubeBrandDrawtextFilter({
    label: opts.label,
    fontFile: opts.fontFile,
    contentCrop: opts.contentCrop,
  })

  return [
    '-y',
    '-i',
    opts.inputPath,
    '-vf',
    drawtext,
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-crf',
    '23',
    '-c:a',
    'copy',
    '-movflags',
    '+faststart',
    opts.outputPath,
  ]
}

export interface YoutubeUploadVariantResult {
  /** File the YouTube uploader should send (shared edit or branded overlay). */
  localFilePath: string
  /** True if we burned niche brand text onto this copy. */
  brandOverlayApplied: boolean
  detectionReason: string
}

/**
 * File for YouTube only. If the reel already has burned-in captions, keep the shared edit.
 * Otherwise burn niche brand text on the graphical area. Instagram still gets the plain export.
 */
export async function prepareYoutubeUploadVariant(opts: {
  jobId: string
  nicheSlug: string
  sourcePath: string
}): Promise<YoutubeUploadVariantResult> {
  const { jobId, nicheSlug, sourcePath } = opts

  const detection = await detectHardCaptions(sourcePath)

  if (detection.hasCText) {
    await writeJobEvent(
      jobId,
      'upload',
      'youtube_ctext_present',
      detection.reason,
      'info',
      {
        meanScore: detection.meanScore,
        framesSampled: detection.framesSampled,
        framesAboveThreshold: detection.framesAboveThreshold,
      },
    )
    return {
      localFilePath: sourcePath,
      brandOverlayApplied: false,
      detectionReason: detection.reason,
    }
  }

  const label = youtubeBrandLabelForNiche(nicheSlug)
  if (!label) {
    logger.warn({
      msg: 'Unknown niche for YouTube brand c-text — uploading without overlay',
      jobId,
      nicheSlug,
    })
    return {
      localFilePath: sourcePath,
      brandOverlayApplied: false,
      detectionReason: `Unknown niche slug '${nicheSlug}'; skipped brand overlay`,
    }
  }

  const outputPath = path.join(
    path.dirname(sourcePath),
    `upload-youtube-${path.basename(sourcePath)}`,
  )
  const fontFile = await resolveDrawtextFont()
  if (!fontFile) {
    logger.warn({
      msg: 'No drawtext font found — YouTube brand overlay may fail or use ffmpeg default',
      jobId,
    })
  }

  const args = buildYoutubeBrandOverlayArgs({
    inputPath: sourcePath,
    outputPath,
    label,
    fontFile,
    contentCrop: detection.contentCrop,
  })

  try {
    await runCommand('ffmpeg', args, { timeout: 600_000 })
    await fs.access(outputPath)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error({
      msg: 'YouTube brand c-text overlay failed',
      jobId,
      error: message,
    })
    await writeJobEvent(
      jobId,
      'upload',
      'youtube_brand_ctext_failed',
      `Brand c-text overlay failed. ${message.slice(0, 240)}`,
      'error',
      { label, error: message.slice(0, 500) },
    )
    throw new ProjectApiError(
      ERROR_CODES.FFMPEG_FAILED,
      `YouTube brand overlay failed: ${message.slice(0, 240)}`,
    )
  }

  await writeJobEvent(
    jobId,
    'upload',
    'youtube_brand_ctext_applied',
    `Applied pulsing brand c-text '${label}' for YouTube (no hard captions on source)`,
    'info',
    {
      label,
      outputPath,
      contentCrop: detection.contentCrop,
      detectionReason: detection.reason,
    },
  )

  logger.info({
    msg: 'YouTube brand c-text overlay applied',
    jobId,
    label,
    outputPath,
  })

  return {
    localFilePath: outputPath,
    brandOverlayApplied: true,
    detectionReason: detection.reason,
  }
}
