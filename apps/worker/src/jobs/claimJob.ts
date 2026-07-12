import type { DbJobRow } from '../db/jobsRepo'
import { claimNextJob, updateJobStatus, writeJobEvent } from '../db/jobsRepo'
import { supabaseAdmin } from '../db/supabaseAdmin'
import { logger } from '../logging/logger'

import { getUploadQueueStatus } from './ConcurrencyGuard'
import { checkNicheDailyUploadLimits, dailyLimitDeferMessage } from './dailyUploadLimit'
import { recoverStaleUploadingJobs } from './recoverStaleUploads'

/**
 * Claim next queued job, with backpressure while a Playwright upload is active.
 * Prevents n8n from stacking overlapping uploads that collide on Chrome profiles.
 * Also skips niches whose YouTube/Instagram accounts already hit the daily upload cap.
 */
export async function claimJob(workerId: string): Promise<DbJobRow | null> {
  // Heal crash zombies before backpressure checks so one hung IG upload cannot
  // freeze the queue forever after the worker restarts.
  try {
    const recovered = await recoverStaleUploadingJobs(workerId)
    if (recovered > 0) {
      logger.info({ msg: 'Recovered stale uploading jobs before claim', workerId, recovered })
    }
  } catch (err) {
    logger.warn({ msg: 'Stale upload recovery failed before claim', workerId, err: String(err) })
  }

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

  // Only block on actively locked uploads. Stale `uploading` rows with no/expired
  // lock (e.g. after a crash) must not freeze the entire claim queue.
  const { count: uploadingCount, error } = await supabaseAdmin
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'uploading')
    .gt('lock_expires_at', new Date().toISOString())

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

  // Try a few claims so one niche at its daily cap does not starve others.
  // Migration 0016 also skips same-day deferred jobs in claim_next_job.
  const skipped = new Set<string>()
  for (let attempt = 0; attempt < 8; attempt++) {
    const job = await claimNextJob(workerId)
    if (!job) return null
    if (skipped.has(job.id)) {
      return null
    }

    try {
      const limitCheck = await checkNicheDailyUploadLimits(job.niche_id)
      if (limitCheck.blocked) {
        skipped.add(job.id)
        await releaseClaimToQueued(job.id, workerId, dailyLimitDeferMessage(limitCheck))
        logger.info({
          msg: 'Released claim — daily upload limit reached for niche accounts',
          jobId: job.id,
          nicheId: job.niche_id,
          usages: limitCheck.usages,
        })
        continue
      }
    } catch (err) {
      // Account mapping errors should not leave the job locked forever.
      logger.warn({
        msg: 'Daily limit check failed during claim — releasing to queued',
        jobId: job.id,
        err: String(err),
      })
      skipped.add(job.id)
      await releaseClaimToQueued(job.id, workerId, 'Daily limit check failed; re-queued')
      continue
    }

    return job
  }

  return null
}

async function releaseClaimToQueued(jobId: string, workerId: string, reason: string): Promise<void> {
  await updateJobStatus(jobId, 'queued', {
    locked_by: null,
    locked_at: null,
    lock_expires_at: null,
    failure_code: 'DAILY_UPLOAD_LIMIT_REACHED',
    failure_reason: reason,
  })
  await writeJobEvent(
    jobId,
    'claim',
    'daily_upload_limit_deferred',
    reason,
    'info',
    { workerId },
  )
}
