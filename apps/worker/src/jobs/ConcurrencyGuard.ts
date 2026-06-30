import pLimit from 'p-limit'

import { config } from '../config'
import { logger } from '../logging/logger'

const ffmpegLimit = pLimit(config.MAX_FFMPEG_CONCURRENCY)

export function withFfmpegConcurrency<T>(fn: () => Promise<T>): Promise<T> {
  logger.debug({
    msg: 'Queuing FFmpeg job',
    activeCount: ffmpegLimit.activeCount,
    pendingCount: ffmpegLimit.pendingCount,
  })
  return ffmpegLimit(fn)
}

export function getFfmpegQueueStatus() {
  return {
    active: ffmpegLimit.activeCount,
    pending: ffmpegLimit.pendingCount,
    concurrencyLimit: config.MAX_FFMPEG_CONCURRENCY,
  }
}
