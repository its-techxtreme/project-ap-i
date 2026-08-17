import { ERROR_CODES, ProjectApiError } from '@project-api/shared'
import { getJobById, getNicheSlugById, updateJobStatus, writeJobEvent, writeAuditLog } from '../db/jobsRepo'
import { createUploadCoordinator } from '../uploaders'
import { logger } from '../logging/logger'

import { isCollectorUsingChrome } from '../collector/collectorHold'
import { withUploadConcurrency } from './ConcurrencyGuard'
import {
  DAILY_UPLOAD_WINDOW_MS,
  checkNicheDailyUploadLimits,
  clearForceUploadOverride,
  dailyLimitDeferMessage,
  hasForceUploadOverride,
} from './dailyUploadLimit'
import { finalizeUploadStatus, platformsNeedingUpload } from './uploadFinalize'
import { prepareLocalUploadFile } from './uploadLocalFile'

function isWithinDailyLimitDeferral(job: {
  failure_code?: string | null
  updated_at?: string
}): boolean {
  if (job.failure_code !== ERROR_CODES.DAILY_UPLOAD_LIMIT_REACHED) return false
  if (!job.updated_at) return true
  const ageMs = Date.now() - new Date(job.updated_at).getTime()
  return Number.isFinite(ageMs) && ageMs < DAILY_UPLOAD_WINDOW_MS
}

export async function retryJob(jobId: string, platform?: 'youtube' | 'instagram'): Promise<void> {
  if (isCollectorUsingChrome()) {
    logger.info({ msg: 'Retry deferred — collector is using Chrome', jobId, platform })
    return
  }
  return withUploadConcurrency(() => retryJobInner(jobId, platform))
}

async function retryJobInner(jobId: string, platform?: 'youtube' | 'instagram'): Promise<void> {
  const job = await getJobById(jobId)
  if (!job) {
    throw new ProjectApiError(ERROR_CODES.JOB_NOT_FOUND, `Job not found: ${jobId}`)
  }

  // Never clobber a finished / cancelled job (late WF-08 retries after verify+Drive cleanup).
  if (job.status === 'completed' || job.status === 'cancelled' || job.status === 'ignored') {
    logger.info({
      msg: 'Retry skipped — job already in terminal status',
      jobId,
      status: job.status,
    })
    return
  }

  // Include `uploading` so crash-stuck retries can recover (retry_scheduled + no active work).
  const retryableStatuses = [
    'failed',
    'needs_manual_review',
    'ready_to_upload',
    'awaiting_verification',
    'uploading',
  ]
  if (!retryableStatuses.includes(job.status)) {
    throw new ProjectApiError(
      ERROR_CODES.JOB_NOT_FOUND,
      `Job status ${job.status} is not retryable`,
    )
  }

  if (isWithinDailyLimitDeferral(job) && !hasForceUploadOverride(job)) {
    logger.info({
      msg: 'Retry skipped — job parked for daily upload limit window',
      jobId,
      failureCode: job.failure_code,
      updatedAt: job.updated_at,
    })
    return
  }

  const targets = platformsNeedingUpload(
    job.youtube_upload_status,
    job.instagram_upload_status,
    platform,
  )

  if (targets.length === 0) {
    // Both sides already uploaded/verified — do not require Drive (may already be cleaned up).
    logger.info({ msg: 'Retry upload skipped — no platforms need upload', jobId, platform })
    if (job.status === 'needs_manual_review') {
      // Heal false DRIVE_FILE_MISSING after a successful upload+verify race.
      const bothVerified =
        (job.youtube_upload_status === 'uploaded' || job.youtube_upload_status === 'verified') &&
        (job.instagram_upload_status === 'uploaded' || job.instagram_upload_status === 'verified')
      if (bothVerified) {
        await updateJobStatus(jobId, 'completed', {
          failure_code: null,
          failure_reason: null,
          completed_at: job.completed_at ?? new Date().toISOString(),
        })
        return
      }
    }
    await finalizeUploadStatus(jobId, job.youtube_upload_status, job.instagram_upload_status)
    return
  }

  if (!job.drive_file_id || job.drive_deleted_at) {
    await updateJobStatus(job.id, 'needs_manual_review', {
      failure_code: ERROR_CODES.DRIVE_FILE_MISSING,
      failure_reason: 'Drive file missing or deleted, cannot retry upload',
    })

    await writeAuditLog({
      actorType: 'worker',
      action: 'retry_failed_drive_missing',
      targetType: 'job',
      targetId: jobId,
      metadata: { drive_file_id: job.drive_file_id, drive_deleted_at: job.drive_deleted_at },
    })

    throw new ProjectApiError(ERROR_CODES.DRIVE_FILE_MISSING, 'Drive file missing, cannot retry')
  }

  const forceOverride = hasForceUploadOverride(job)
  if (!forceOverride) {
    const limitCheck = await checkNicheDailyUploadLimits(job.niche_id, {
      youtube: targets.includes('youtube'),
      instagram: targets.includes('instagram'),
    })
    if (limitCheck.blocked) {
      const message = dailyLimitDeferMessage(limitCheck)
      logger.info({
        msg: 'Deferring retry upload — daily account limit reached',
        jobId,
        usages: limitCheck.usages,
      })
      await updateJobStatus(job.id, 'ready_to_upload', {
        ...(targets.includes('youtube') ? { youtube_upload_status: 'pending' } : {}),
        ...(targets.includes('instagram') ? { instagram_upload_status: 'pending' } : {}),
        failure_code: ERROR_CODES.DAILY_UPLOAD_LIMIT_REACHED,
        failure_reason: message,
      })
      await writeJobEvent(job.id, 'retry', 'daily_upload_limit_deferred', message, 'info', {
        usages: limitCheck.usages,
        limit: limitCheck.limit,
      })
      return
    }
  } else {
    logger.info({
      msg: 'Retry upload proceeding with admin force_upload_override',
      jobId,
    })
    await clearForceUploadOverride(jobId)
    await writeJobEvent(
      jobId,
      'retry',
      'force_upload_override_consumed',
      'Admin force-start consumed — soft daily upload limit bypassed for this retry',
      'info',
    )
  }

  logger.info({ msg: 'Starting retry upload', jobId, platform, targets })

  const nextYoutubeRetry =
    targets.includes('youtube') ? job.youtube_retry_count + 1 : job.youtube_retry_count
  const nextInstagramRetry =
    targets.includes('instagram') ? job.instagram_retry_count + 1 : job.instagram_retry_count

  const statusUpdates: Record<string, unknown> = {}
  if (targets.includes('youtube')) {
    statusUpdates.youtube_retry_count = nextYoutubeRetry
    statusUpdates.youtube_upload_status = 'retry_scheduled'
  }
  if (targets.includes('instagram')) {
    statusUpdates.instagram_retry_count = nextInstagramRetry
    statusUpdates.instagram_upload_status = 'retry_scheduled'
  }

  await updateJobStatus(job.id, 'uploading', statusUpdates)

  await writeJobEvent(
    job.id,
    'retry',
    'retry_upload_started',
    `Retry upload started for ${platform ?? targets.join(', ')} platform(s)`,
  )

  const nicheSlug = await getNicheSlugById(job.niche_id)
  if (!nicheSlug) {
    throw new ProjectApiError(
      ERROR_CODES.NICHE_ACCOUNT_NOT_FOUND,
      `Niche slug not found for niche_id: ${job.niche_id}`,
    )
  }

  const coordinator = createUploadCoordinator()
  const { localFilePath, cleanup } = await prepareLocalUploadFile(jobId, job.drive_file_id)

  if (localFilePath) {
    logger.info({ msg: 'Staged Drive file downloaded for retry upload', jobId, localFilePath })
  }

  try {
    await coordinator.uploadBothPlatforms({
      id: job.id,
      nicheId: job.niche_id,
      nicheSlug,
      driveFileId: job.drive_file_id,
      driveViewUrl: job.drive_view_url ?? undefined,
      youtubeTitle: job.youtube_title ?? undefined,
      youtubeDescription: job.youtube_description ?? undefined,
      instagramCaption: job.instagram_caption ?? undefined,
      youtubeRetryCount: nextYoutubeRetry,
      instagramRetryCount: nextInstagramRetry,
      localFilePath,
      platformsToUpload: targets,
    })
  } catch (err) {
    if (err instanceof ProjectApiError && err.code === ERROR_CODES.DAILY_UPLOAD_LIMIT_REACHED) {
      logger.info({ msg: 'Retry parked after platform daily limit', jobId, error: err.message })
      const latest = await getJobById(jobId)
      await updateJobStatus(jobId, 'ready_to_upload', {
        youtube_upload_status:
          latest?.youtube_upload_status === 'uploaded' || latest?.youtube_upload_status === 'verified'
            ? latest.youtube_upload_status
            : targets.includes('youtube')
              ? 'pending'
              : latest?.youtube_upload_status,
        instagram_upload_status:
          latest?.instagram_upload_status === 'uploaded' ||
          latest?.instagram_upload_status === 'verified'
            ? latest.instagram_upload_status
            : targets.includes('instagram')
              ? 'pending'
              : latest?.instagram_upload_status,
        failure_code: ERROR_CODES.DAILY_UPLOAD_LIMIT_REACHED,
        failure_reason: err.message,
      })
      await writeJobEvent(jobId, 'retry', 'daily_upload_limit_deferred', err.message, 'warning')
      return
    }
    throw err
  } finally {
    await cleanup()
  }

  const updatedJob = await getJobById(jobId)
  await finalizeUploadStatus(
    jobId,
    updatedJob?.youtube_upload_status,
    updatedJob?.instagram_upload_status,
  )

  await writeAuditLog({
    actorType: 'admin',
    action: 'manual_retry_requested',
    targetType: 'job',
    targetId: jobId,
    metadata: { platform: platform ?? targets.join(',') },
  })
}
