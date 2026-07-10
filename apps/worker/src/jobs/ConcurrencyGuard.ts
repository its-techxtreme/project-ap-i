import pLimit from 'p-limit'

import { DEFAULTS } from '@project-api/shared'

import { config } from '../config'
import { logger } from '../logging/logger'

const ffmpegLimit = pLimit(config.MAX_FFMPEG_CONCURRENCY)

/** One Playwright upload pipeline at a time on the MVP host (YT+IG sequential inside). */
const uploadLimit = pLimit(DEFAULTS.MAX_UPLOAD_CONCURRENCY_PER_PLATFORM)

export function withFfmpegConcurrency<T>(fn: () => Promise<T>): Promise<T> {
  logger.debug({
    msg: 'Queuing FFmpeg job',
    activeCount: ffmpegLimit.activeCount,
    pendingCount: ffmpegLimit.pendingCount,
  })
  return ffmpegLimit(fn)
}

export function withUploadConcurrency<T>(fn: () => Promise<T>): Promise<T> {
  logger.info({
    msg: 'Queuing platform upload',
    activeCount: uploadLimit.activeCount,
    pendingCount: uploadLimit.pendingCount,
  })
  return uploadLimit(fn)
}

export function getFfmpegQueueStatus() {
  return {
    active: ffmpegLimit.activeCount,
    pending: ffmpegLimit.pendingCount,
    concurrencyLimit: config.MAX_FFMPEG_CONCURRENCY,
  }
}

export function getUploadQueueStatus() {
  return {
    active: uploadLimit.activeCount,
    pending: uploadLimit.pendingCount,
    concurrencyLimit: DEFAULTS.MAX_UPLOAD_CONCURRENCY_PER_PLATFORM,
  }
}
