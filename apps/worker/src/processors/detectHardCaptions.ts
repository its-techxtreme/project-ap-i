import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { logger } from '../logging/logger'
import { runCommand } from '../utils/runCommand'

import type { ContentCrop } from './youtubeBrandCText'

export interface HardCaptionDetectionResult {
  hasCText: boolean
  /** Mean caption-likelihood score across sampled frames (0–1-ish scale). */
  meanScore: number
  framesSampled: number
  framesAboveThreshold: number
  contentCrop: ContentCrop | null
  reason: string
}

const BAND_WIDTH = 320
const BAND_HEIGHT = 120

/** Rows with this many strong horizontal edges look like subtitle lines. */
const ROW_EDGE_SPIKE_THRESHOLD = 18
/** Fraction of caption-band rows that must look "texty" for a frame hit. */
const FRAME_TEXT_ROW_RATIO = 0.08
/** Absolute mean luminance gradient needed so quiet frames don't false-positive. */
const MIN_MEAN_ABS_GRAD = 6
/** A frame counts as having c-text when its score exceeds this. */
export const HARD_CAPTION_FRAME_SCORE_THRESHOLD = 0.55
/** Need this many positive frames (of those sampled) to declare c-text present. */
const MIN_POSITIVE_FRAMES = 2

/**
 * Scores a grayscale caption-band buffer for burned-in text likelihood.
 * Exported for unit tests — pure, no FFmpeg.
 */
export function scoreCaptionBandGray(pixels: Buffer, width: number, height: number): number {
  if (width < 8 || height < 4 || pixels.length < width * height) {
    return 0
  }

  let textyRows = 0
  let gradSum = 0
  let gradCount = 0

  for (let y = 0; y < height; y++) {
    let spikes = 0
    let rowGrad = 0
    for (let x = 1; x < width; x++) {
      const a = pixels[y * width + x - 1]!
      const b = pixels[y * width + x]!
      const g = Math.abs(b - a)
      rowGrad += g
      gradSum += g
      gradCount++
      if (g >= 40) spikes++
    }
    const meanRowGrad = rowGrad / Math.max(1, width - 1)
    if (spikes >= ROW_EDGE_SPIKE_THRESHOLD && meanRowGrad >= 8) {
      textyRows++
    }
  }

  const meanAbsGrad = gradCount > 0 ? gradSum / gradCount : 0
  if (meanAbsGrad < MIN_MEAN_ABS_GRAD) {
    return 0
  }

  const rowRatio = textyRows / height
  const score = Math.min(1, rowRatio / Math.max(FRAME_TEXT_ROW_RATIO, 0.01))
  const energyBoost = Math.min(0.25, (meanAbsGrad - MIN_MEAN_ABS_GRAD) / 80)
  return Math.min(1, score + energyBoost)
}

async function probeDurationSeconds(videoPath: string): Promise<number> {
  const result = await runCommand(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      videoPath,
    ],
    { timeout: 30_000 },
  )
  const duration = Number.parseFloat(result.stdout.trim())
  return Number.isFinite(duration) && duration > 0 ? duration : 5
}

/**
 * Best-effort letterbox crop via ffmpeg cropdetect (last reported crop=W:H:X:Y).
 */
export async function detectContentCrop(videoPath: string): Promise<ContentCrop | null> {
  try {
    const result = await runCommand(
      'ffmpeg',
      [
        '-hide_banner',
        '-i',
        videoPath,
        '-t',
        '3',
        '-vf',
        'cropdetect=24:2:0',
        '-f',
        'null',
        '-',
      ],
      { timeout: 60_000 },
    )
    const combined = `${result.stderr}\n${result.stdout}`
    const matches = [...combined.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)]
    const last = matches.at(-1)
    if (!last) return null
    const w = Number(last[1])
    const h = Number(last[2])
    const x = Number(last[3])
    const y = Number(last[4])
    if (![w, h, x, y].every((n) => Number.isFinite(n) && n >= 0) || w < 16 || h < 16) {
      return null
    }
    return { w, h, x, y }
  } catch (err) {
    logger.warn({
      msg: 'cropdetect failed — brand overlay will use full-frame placement',
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

function captionBandVf(contentCrop: ContentCrop | null): string {
  const parts: string[] = []
  if (contentCrop) {
    parts.push(`crop=${contentCrop.w}:${contentCrop.h}:${contentCrop.x}:${contentCrop.y}`)
    const bandH = Math.max(8, Math.floor(contentCrop.h * 0.38))
    const bandY = Math.max(0, contentCrop.h - bandH)
    parts.push(`crop=${contentCrop.w}:${bandH}:0:${bandY}`)
  } else {
    parts.push('crop=iw:ih*0.38:0:ih*0.58')
  }
  parts.push(`format=gray`, `scale=${BAND_WIDTH}:${BAND_HEIGHT}`)
  return parts.join(',')
}

async function extractCaptionBandGray(opts: {
  videoPath: string
  timeSeconds: number
  contentCrop: ContentCrop | null
  outPath: string
}): Promise<{ width: number; height: number; pixels: Buffer } | null> {
  const { videoPath, timeSeconds, contentCrop, outPath } = opts
  try {
    await runCommand(
      'ffmpeg',
      [
        '-y',
        '-ss',
        String(Math.max(0, timeSeconds)),
        '-i',
        videoPath,
        '-frames:v',
        '1',
        '-vf',
        captionBandVf(contentCrop),
        '-f',
        'rawvideo',
        '-pix_fmt',
        'gray',
        outPath,
      ],
      { timeout: 45_000 },
    )
    const pixels = await fs.readFile(outPath)
    const expected = BAND_WIDTH * BAND_HEIGHT
    if (pixels.length < expected) return null
    return { width: BAND_WIDTH, height: BAND_HEIGHT, pixels: pixels.subarray(0, expected) }
  } catch {
    return null
  }
}

/**
 * Detects burned-in hard captions (c-text) by sampling caption-band frames and
 * scoring edge/contrast patterns typical of outlined subtitle glyphs.
 */
export async function detectHardCaptions(
  videoPath: string,
): Promise<HardCaptionDetectionResult> {
  const contentCrop = await detectContentCrop(videoPath)
  const duration = await probeDurationSeconds(videoPath)

  const sampleFractions = [0.12, 0.28, 0.45, 0.62, 0.78]
  const times = sampleFractions.map((f) => Math.min(duration * 0.95, Math.max(0.05, duration * f)))

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'api-ctext-'))
  const scores: number[] = []

  try {
    for (let i = 0; i < times.length; i++) {
      const rawPath = path.join(tmpRoot, `band_${i}.raw`)
      const band = await extractCaptionBandGray({
        videoPath,
        timeSeconds: times[i]!,
        contentCrop,
        outPath: rawPath,
      })
      await fs.unlink(rawPath).catch(() => undefined)
      if (!band) continue
      scores.push(scoreCaptionBandGray(band.pixels, band.width, band.height))
    }
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined)
  }

  const framesSampled = scores.length
  const framesAboveThreshold = scores.filter((s) => s >= HARD_CAPTION_FRAME_SCORE_THRESHOLD).length
  const meanScore =
    framesSampled > 0 ? scores.reduce((a, b) => a + b, 0) / framesSampled : 0

  const hasCText =
    framesSampled >= 2 &&
    (framesAboveThreshold >= MIN_POSITIVE_FRAMES ||
      (framesAboveThreshold >= 1 && meanScore >= HARD_CAPTION_FRAME_SCORE_THRESHOLD))

  const reason = hasCText
    ? `Hard captions likely (${framesAboveThreshold}/${framesSampled} frames above threshold, mean=${meanScore.toFixed(2)})`
    : `No hard captions detected (${framesAboveThreshold}/${framesSampled} frames above threshold, mean=${meanScore.toFixed(2)})`

  logger.info({
    msg: 'Hard caption (c-text) detection complete',
    videoPath,
    hasCText,
    meanScore,
    framesSampled,
    framesAboveThreshold,
    contentCrop,
  })

  return {
    hasCText,
    meanScore,
    framesSampled,
    framesAboveThreshold,
    contentCrop,
    reason,
  }
}
