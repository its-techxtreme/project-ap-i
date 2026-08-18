import { getFfmpegQueueStatus, getUploadQueueStatus } from '../jobs/ConcurrencyGuard'
import { supabaseAdmin } from '../db/supabaseAdmin'
import { logger } from '../logging/logger'

const IN_FLIGHT = [
  'locked',
  'validating',
  'downloading',
  'downloaded',
  'processing',
  'processed',
  'staging_to_drive',
  'ready_to_upload',
  'uploading',
] as const

let holdNextClaim = false
let collectorUsingChrome = false

export function setCollectorHold(value: boolean): void {
  holdNextClaim = value
  logger.info({ msg: value ? 'Collector hold on — next claims paused' : 'Collector hold off' })
}

export function isCollectorHold(): boolean {
  return holdNextClaim
}

/** True only while the collector Playwright session is open. Uploads may still run during idle wait. */
export function setCollectorUsingChrome(value: boolean): void {
  collectorUsingChrome = value
}

export function isCollectorUsingChrome(): boolean {
  return collectorUsingChrome
}

export async function isPipelineIdle(): Promise<boolean> {
  const ffmpeg = getFfmpegQueueStatus()
  const upload = getUploadQueueStatus()
  if (ffmpeg.active > 0 || ffmpeg.pending > 0 || upload.active > 0 || upload.pending > 0) {
    return false
  }

  const { count, error } = await supabaseAdmin
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .in('status', [...IN_FLIGHT])
    .gt('lock_expires_at', new Date().toISOString())
    // Stale locks from a killed worker shouldn't stall DM collection.
    .gte('updated_at', new Date(Date.now() - 120_000).toISOString())

  if (error) {
    logger.warn({ msg: 'Collector idle check failed', error: error.message })
    return false
  }

  return (count ?? 0) === 0
}

export async function waitForPipelineIdle(opts?: {
  timeoutMs?: number
  pollMs?: number
}): Promise<boolean> {
  const timeoutMs = opts?.timeoutMs ?? 45 * 60_000
  const pollMs = opts?.pollMs ?? 5_000
  const started = Date.now()

  while (Date.now() - started < timeoutMs) {
    if (await isPipelineIdle()) return true
    await new Promise((r) => setTimeout(r, pollMs))
  }

  logger.warn({ msg: 'Collector wait for idle timed out', timeoutMs })
  return false
}
