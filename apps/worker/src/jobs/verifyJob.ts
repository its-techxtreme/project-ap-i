import { ERROR_CODES, ProjectApiError } from '@project-api/shared'
import type { DbJobRow } from '../db/jobsRepo'
import { getJobById, updateJobStatus, writeJobEvent, writeAuditLog } from '../db/jobsRepo'
import { createDriveStorage } from '../storage'
import { logger } from '../logging/logger'

const MAX_RETRY_COUNT = 2

async function scheduleRetry(
  job: DbJobRow,
  platform: 'youtube' | 'instagram',
  attemptNumber: number,
): Promise<void> {
  const retryCountField = platform === 'youtube' ? 'youtube_retry_count' : 'instagram_retry_count'
  const uploadStatusField = platform === 'youtube' ? 'youtube_upload_status' : 'instagram_upload_status'

  await updateJobStatus(job.id, 'ready_to_upload', {
    [retryCountField]: attemptNumber,
    [uploadStatusField]: 'retry_scheduled',
  })

  await writeJobEvent(
    job.id,
    'verify',
    `${platform}_retry_scheduled`,
    `${platform} upload failed, retry scheduled (attempt ${attemptNumber}/${MAX_RETRY_COUNT})`,
  )
}

async function markNeedsManualReview(
  job: DbJobRow,
  platform: 'youtube' | 'instagram',
  attemptNumber: number,
): Promise<void> {
  const failureCode = platform === 'youtube' ? ERROR_CODES.YOUTUBE_UPLOAD_FAILED : ERROR_CODES.INSTAGRAM_UPLOAD_FAILED

  await updateJobStatus(job.id, 'needs_manual_review', {
    failure_code: failureCode,
    failure_reason: `${platform} upload failed after ${attemptNumber} attempts`,
  })

  await writeJobEvent(
    job.id,
    'verify',
    `${platform}_verification_failed`,
    `${platform} upload failed ${attemptNumber} times, manual review required`,
    'warning',
  )
}

async function handleUncertainVerification(job: DbJobRow): Promise<void> {
  await updateJobStatus(job.id, job.status, {
    verification_status: 'uncertain',
  })

  await writeJobEvent(
    job.id,
    'verify',
    'verification_uncertain',
    'Unable to determine upload status, admin review recommended',
    'warning',
  )

  await writeAuditLog({
    actorType: 'worker',
    action: 'verification_uncertain',
    targetType: 'job',
    targetId: job.id,
    metadata: {
      youtube_upload_status: job.youtube_upload_status,
      instagram_upload_status: job.instagram_upload_status,
    },
  })
}

export async function verifyJob(jobId: string): Promise<void> {
  const job = await getJobById(jobId)
  if (!job) {
    throw new ProjectApiError(ERROR_CODES.JOB_NOT_FOUND, `Job not found: ${jobId}`)
  }

  logger.info({ msg: 'Starting verification', jobId })

  const youtubeStatus = job.youtube_upload_status
  const instagramStatus = job.instagram_upload_status
  const youtubeRetryCount = job.youtube_retry_count
  const instagramRetryCount = job.instagram_retry_count

  const bothUploaded = youtubeStatus === 'uploaded' && instagramStatus === 'uploaded'
  const anyFailed = youtubeStatus === 'failed' || instagramStatus === 'failed'
  const anyLoginRequired = youtubeStatus === 'login_required' || instagramStatus === 'login_required'

  if (bothUploaded) {
    // Both platforms uploaded successfully - mark as verified and cleanup
    await updateJobStatus(jobId, 'completed', {
      youtube_upload_status: 'verified',
      instagram_upload_status: 'verified',
      verification_status: 'verified',
      completed_at: new Date().toISOString(),
    })

    await writeJobEvent(jobId, 'verify', 'verification_completed', 'Both platforms verified')

    await writeAuditLog({
      actorType: 'worker',
      action: 'job_verified',
      targetType: 'job',
      targetId: jobId,
    })

    // Trigger Drive cleanup
    await cleanupDriveFile(job)
    return
  }

  if (anyLoginRequired) {
    // Login required - mark as needs_manual_review
    await updateJobStatus(jobId, 'needs_manual_review', {
      failure_code: youtubeStatus === 'login_required' ? ERROR_CODES.YOUTUBE_LOGIN_REQUIRED : ERROR_CODES.INSTAGRAM_LOGIN_REQUIRED,
      failure_reason: 'Platform session requires login',
    })

    await writeJobEvent(jobId, 'verify', 'verification_login_required', 'Platform login required', 'warning')
    return
  }

  if (anyFailed) {
    // Check retry counts for each failed platform
    const youtubeFailed = youtubeStatus === 'failed'
    const instagramFailed = instagramStatus === 'failed'

    if (youtubeFailed) {
      // If already at max retries (youtube_retry_count >= MAX_RETRY_COUNT), mark for manual review
      if (youtubeRetryCount >= MAX_RETRY_COUNT) {
        await markNeedsManualReview(job, 'youtube', youtubeRetryCount)
      } else {
        const nextAttempt = youtubeRetryCount + 1
        await scheduleRetry(job, 'youtube', nextAttempt)
      }
    }

    if (instagramFailed) {
      // If already at max retries (instagram_retry_count >= MAX_RETRY_COUNT), mark for manual review
      if (instagramRetryCount >= MAX_RETRY_COUNT) {
        await markNeedsManualReview(job, 'instagram', instagramRetryCount)
      } else {
        const nextAttempt = instagramRetryCount + 1
        await scheduleRetry(job, 'instagram', nextAttempt)
      }
    }

    // If either platform still has retries, status will be ready_to_upload
    // If both exhausted, status will be needs_manual_review
    return
  }

  // Uncertain state - neither uploaded nor failed nor login_required
  await handleUncertainVerification(job)
}

async function cleanupDriveFile(job: DbJobRow): Promise<void> {
  if (!job.drive_file_id) {
    logger.warn({ msg: 'No Drive file to cleanup', jobId: job.id })
    return
  }

  if (job.drive_folder_state === 'deleted') {
    logger.info({ msg: 'Drive file already deleted', jobId: job.id })
    return
  }

  const driveStorage = createDriveStorage()

  try {
    await driveStorage.delete(job.drive_file_id, job.id)

    await updateJobStatus(job.id, job.status, {
      drive_folder_state: 'deleted',
      drive_deleted_at: new Date().toISOString(),
    })

    await writeJobEvent(job.id, 'cleanup', 'drive_deleted', 'Drive file deleted after successful verification')

    await writeAuditLog({
      actorType: 'worker',
      action: 'drive_deleted',
      targetType: 'job',
      targetId: job.id,
      metadata: { drive_file_id: job.drive_file_id },
    })

    logger.info({ msg: 'Drive file cleaned up', jobId: job.id, driveFileId: job.drive_file_id })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error({ msg: 'Failed to cleanup Drive file', jobId: job.id, error: message })
    throw err
  }
}