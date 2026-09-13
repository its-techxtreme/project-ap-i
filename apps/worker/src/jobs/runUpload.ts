import { ERROR_CODES, ProjectApiError } from '@project-api/shared'

import { config } from '../config'
import { getJobById, getNicheSlugById, updateJobStatus, writeJobEvent } from '../db/jobsRepo'
import { supabaseAdmin } from '../db/supabaseAdmin'
import { createUploadCoordinator } from '../uploaders'
import { logger } from '../logging/logger'

import { isCollectorHold, isCollectorUsingChrome } from '../collector/collectorHold'
import { withUploadConcurrency } from './ConcurrencyGuard'
import {
  DAILY_UPLOAD_WINDOW_MS,
  checkNicheDailyUploadLimits,
  clearForceUploadOverride,
  dailyLimitDeferMessage,
  hasForceUploadOverride,
} from './dailyUploadLimit'
import { finalizeUploadStatus } from './uploadFinalize'
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

/** Upload both platforms. Mock unless REAL_UPLOADS_ENABLED, then Playwright. */
export async function runUpload(jobId: string): Promise<string> {
  if (isCollectorHold() || isCollectorUsingChrome()) {
    logger.info({ msg: 'Upload deferred — collector hold is on', jobId })
    return 'ready_to_upload'
  }
  return withUploadConcurrency(() => runUploadInner(jobId))
}

async function runUploadInner(jobId: string): Promise<string> {
  const job = await getJobById(jobId)
  if (!job) {
    throw new ProjectApiError(ERROR_CODES.JOB_NOT_FOUND, `Job not found: ${jobId}`, { stage: 'upload' })
  }

  if (!job.drive_file_id) {
    throw new ProjectApiError(ERROR_CODES.DRIVE_UPLOAD_FAILED, 'Job has no staged Drive file', {
      stage: 'upload',
    })
  }

  if (isWithinDailyLimitDeferral(job) && !hasForceUploadOverride(job)) {
    logger.info({
      msg: 'Upload skipped — job parked for daily upload limit window',
      jobId,
      failureCode: job.failure_code,
      updatedAt: job.updated_at,
    })
    return 'ready_to_upload'
  }

  const nicheSlug = await getNicheSlugById(job.niche_id)
  if (!nicheSlug) {
    throw new ProjectApiError(
      ERROR_CODES.NICHE_ACCOUNT_NOT_FOUND,
      `Niche slug not found for niche_id: ${job.niche_id}`,
      { stage: 'upload' },
    )
  }

  // Keep uploaded/verified as-is. Only flip the platforms that still need a pass.
  const ytNeeds =
    job.youtube_upload_status !== 'uploaded' && job.youtube_upload_status !== 'verified'
  const igNeeds =
    job.instagram_upload_status !== 'uploaded' && job.instagram_upload_status !== 'verified'

  const forceOverride = hasForceUploadOverride(job)
  if (!forceOverride) {
    const limitCheck = await checkNicheDailyUploadLimits(job.niche_id, {
      youtube: ytNeeds,
      instagram: igNeeds,
    })
    if (limitCheck.blocked) {
      const message = dailyLimitDeferMessage(limitCheck)
      logger.info({
        msg: 'Deferring upload — daily account limit reached',
        jobId,
        usages: limitCheck.usages,
      })
      await updateJobStatus(jobId, 'ready_to_upload', {
        ...(ytNeeds ? { youtube_upload_status: 'pending' } : {}),
        ...(igNeeds ? { instagram_upload_status: 'pending' } : {}),
        failure_code: ERROR_CODES.DAILY_UPLOAD_LIMIT_REACHED,
        failure_reason: message,
      })
      await writeJobEvent(jobId, 'upload', 'daily_upload_limit_deferred', message, 'info', {
        usages: limitCheck.usages,
        limit: limitCheck.limit,
      })
      return 'ready_to_upload'
    }
  } else {
    logger.info({
      msg: 'Upload proceeding with admin force_upload_override (soft daily limit bypass)',
      jobId,
    })
    await clearForceUploadOverride(jobId)
    await writeJobEvent(
      jobId,
      'upload',
      'force_upload_override_consumed',
      'Admin force-start consumed — soft daily upload limit bypassed for this job',
      'info',
    )
  }

  // Keep a lock while Playwright is up. A null lock looked expired and stale-recovery killed the session.
  const lockExpiresAt = new Date(
    Date.now() + Math.max(1, config.JOB_LOCK_MINUTES) * 60_000,
  ).toISOString()
  await updateJobStatus(jobId, 'uploading', {
    ...(ytNeeds ? { youtube_upload_status: 'uploading' } : {}),
    ...(igNeeds ? { instagram_upload_status: 'uploading' } : {}),
    locked_by: `upload-${process.pid}`,
    locked_at: new Date().toISOString(),
    lock_expires_at: lockExpiresAt,
  })

  const coordinator = createUploadCoordinator()
  const { localFilePath, cleanup } = await prepareLocalUploadFile(jobId, job.drive_file_id)

  if (localFilePath) {
    logger.info({ msg: 'Staged Drive file downloaded for upload', jobId, localFilePath })
  }

  const platformsToUpload: Array<'youtube' | 'instagram'> = []
  if (ytNeeds) platformsToUpload.push('youtube')
  if (igNeeds) platformsToUpload.push('instagram')
  if (platformsToUpload.length === 0) {
    logger.info({ msg: 'Upload skipped — both platforms already uploaded/verified', jobId })
    const finalStatus = await finalizeUploadStatus(
      jobId,
      job.youtube_upload_status,
      job.instagram_upload_status,
    )
    return finalStatus
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
      youtubeRetryCount: job.youtube_retry_count,
      instagramRetryCount: job.instagram_retry_count,
      localFilePath,
      platformsToUpload,
    })
  } catch (err) {
    if (err instanceof ProjectApiError && err.code === ERROR_CODES.NICHE_ACCOUNT_MAPPING_INVALID) {
      logger.warn({ msg: 'Upload blocked by invalid account mapping', jobId, error: err.message })
      throw err
    }
    if (err instanceof ProjectApiError && err.code === ERROR_CODES.DAILY_UPLOAD_LIMIT_REACHED) {
      logger.info({ msg: 'Upload parked after platform daily limit', jobId, error: err.message })
      const latest = (await getJobById(jobId)) ?? job
      await parkForDailyLimit(jobId, latest, ytNeeds, igNeeds, err.message)
      return 'ready_to_upload'
    }
    // Crash mid-upload. Settle inflight platforms so claim is not stuck forever.
    const latest = await getJobById(jobId)
    if (latest?.status === 'uploading') {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error({ msg: 'Upload crashed mid-flight — finalizing partial state', jobId, error: msg })
      await settleCrashedUpload(jobId, latest, msg)
      return finalizeUploadStatus(
        jobId,
        (await getJobById(jobId))?.youtube_upload_status,
        (await getJobById(jobId))?.instagram_upload_status,
      )
    }
    throw err
  } finally {
    await cleanup()
  }

  const updatedJob = await getJobById(jobId)
  return finalizeUploadStatus(
    jobId,
    updatedJob?.youtube_upload_status,
    updatedJob?.instagram_upload_status,
  )
}

async function settleCrashedUpload(
  jobId: string,
  job: {
    youtube_upload_status: string
    instagram_upload_status: string
  },
  message: string,
): Promise<void> {
  const patch: Record<string, unknown> = {
    locked_by: null,
    locked_at: null,
    lock_expires_at: null,
  }
  if (job.youtube_upload_status === 'uploading') {
    patch.youtube_upload_status = 'failed'
    await supabaseAdmin
      .from('upload_attempts')
      .update({
        status: 'failed',
        error_code: 'YOUTUBE_UPLOAD_FAILED',
        error_message: message,
        finished_at: new Date().toISOString(),
      })
      .eq('job_id', jobId)
      .eq('platform', 'youtube')
      .eq('status', 'started')
  }
  if (job.instagram_upload_status === 'uploading') {
    patch.instagram_upload_status = 'failed'
    await supabaseAdmin
      .from('upload_attempts')
      .update({
        status: 'failed',
        error_code: 'INSTAGRAM_UPLOAD_FAILED',
        error_message: message,
        finished_at: new Date().toISOString(),
      })
      .eq('job_id', jobId)
      .eq('platform', 'instagram')
      .eq('status', 'started')
  }
  await updateJobStatus(jobId, 'uploading', patch)
  await writeJobEvent(jobId, 'upload', 'upload_crash_settled', message, 'error')
}

async function parkForDailyLimit(
  jobId: string,
  job: {
    youtube_upload_status: string
    instagram_upload_status: string
  },
  ytNeeds: boolean,
  igNeeds: boolean,
  message: string,
): Promise<void> {
  const ytOk =
    job.youtube_upload_status === 'uploaded' || job.youtube_upload_status === 'verified'
  const igOk =
    job.instagram_upload_status === 'uploaded' || job.instagram_upload_status === 'verified'

  await updateJobStatus(jobId, 'ready_to_upload', {
    youtube_upload_status: ytOk ? job.youtube_upload_status : ytNeeds ? 'pending' : job.youtube_upload_status,
    instagram_upload_status: igOk
      ? job.instagram_upload_status
      : igNeeds
        ? 'pending'
        : job.instagram_upload_status,
    failure_code: ERROR_CODES.DAILY_UPLOAD_LIMIT_REACHED,
    failure_reason: message,
  })
  await writeJobEvent(jobId, 'upload', 'daily_upload_limit_deferred', message, 'warning')
}

/** Old name. Call runUpload. */
export { runUpload as runMockUpload }
