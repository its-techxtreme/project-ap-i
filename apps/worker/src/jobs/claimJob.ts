import type { DbJobRow } from '../db/jobsRepo'
import { claimNextJob } from '../db/jobsRepo'
import { supabaseAdmin } from '../db/supabaseAdmin'
import { logger } from '../logging/logger'

import { getUploadQueueStatus } from './ConcurrencyGuard'

/**
 * Claim next queued job, with backpressure while a Playwright upload is active.
 * Prevents n8n from stacking overlapping uploads that collide on Chrome profiles.
 */
export async function claimJob(workerId: string): Promise<DbJobRow | null> {
  const uploadQueue = getUploadQueueStatus()
  if (uploadQueue.active > 0 || uploadQueue.pending > 0) {
    logger.info({
      msg: 'Skipping job claim — upload queue busy',
      workerId,
      uploadActive: uploadQueue.active,
      uploadPending: uploadQueue.pending,
    })
    return null
  }

  const { count: uploadingCount, error } = await supabaseAdmin
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'uploading')

  if (error) {
    logger.warn({ msg: 'Failed to check uploading jobs before claim', error: error.message })
  } else if ((uploadingCount ?? 0) > 0) {
    logger.info({
      msg: 'Skipping job claim — another job is uploading',
      workerId,
      uploadingCount,
    })
    return null
  }

  return claimNextJob(workerId)
}
