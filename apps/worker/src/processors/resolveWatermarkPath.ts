import fs from 'node:fs'
import path from 'node:path'

import { config } from '../config'
import { logger } from '../logging/logger'

const NICHE_SLUGS = ['memes', 'anime', 'sports'] as const
export type WatermarkNicheSlug = (typeof NICHE_SLUGS)[number]

function isWatermarkNicheSlug(slug: string): slug is WatermarkNicheSlug {
  return (NICHE_SLUGS as readonly string[]).includes(slug)
}

/** Default directory: apps/worker/assets/watermarks/{memes,anime,sports}.png */
export function defaultWatermarksDir(): string {
  return path.resolve(__dirname, '../../assets/watermarks')
}

/**
 * Resolves the watermark image for a niche.
 * Prefers niche-specific files under WATERMARKS_DIR (or bundled assets/watermarks).
 * Falls back to WATERMARK_PATH only if the niche file is missing (logged as warning).
 */
export function resolveWatermarkPath(nicheSlug: string): string {
  const dir = config.WATERMARKS_DIR?.trim() || defaultWatermarksDir()
  const slug = nicheSlug.trim().toLowerCase()

  if (isWatermarkNicheSlug(slug)) {
    const nichePath = path.join(dir, `${slug}.png`)
    if (fs.existsSync(nichePath)) {
      return nichePath
    }
    logger.warn({
      msg: 'Niche watermark missing — falling back to WATERMARK_PATH',
      nicheSlug: slug,
      expectedPath: nichePath,
      fallback: config.WATERMARK_PATH,
    })
  } else {
    logger.warn({
      msg: 'Unknown niche slug for watermark — falling back to WATERMARK_PATH',
      nicheSlug,
      fallback: config.WATERMARK_PATH,
    })
  }

  return config.WATERMARK_PATH
}
