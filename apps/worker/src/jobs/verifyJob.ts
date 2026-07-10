import { ERROR_CODES, ProjectApiError } from '@project-api/shared'
import type { DbJobRow } from '../db/jobsRepo'
import { getJobById, updateJobStatus, writeJobEvent, writeAuditLog } from '../db/jobsRepo'
import { supabaseAdmin } from '../db/supabaseAdmin'
import { createDriveStorage } from '../storage'
import { logger } from '../logging/logger'
import { isRealPlatformMediaId } from '../uploaders/platformMediaIds'

const MAX_RETRY_COUNT = 2

type RetryOutcome = 'ok' | 'retry' | 'manual'

export { isRealPlatformMediaId }

function platformOutcome(failed: boolean, retryCount: number): RetryOutcome {
  if (!failed) return 'ok'
  return retryCount >= MAX_RETRY_COUNT ? 'manual' : 'retry'
}

async function hasRecordedUploadAttempts(jobId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('upload_attempts')
    .select('id, platform, status, platform_media_id')
    .eq('job_id', jobId)
    .eq('status', 'uploaded')

  if (error || !data) return false

  const rows = data as Array<{ platform: string; platform_media_id: string | null }>
  const youtubeOk = rows.some(
    (r) => r.platform === 'youtube' && isRealPlatformMediaId('youtube', r.platform_media_id),
  )
  const instagramOk = rows.some(
    (r) => r.platform === 'instagram' && isRealPlatformMediaId('instagram', r.platform_media_id),
  )
  return youtubeOk && instagramOk
}

async function getPublishedPlatformUrls(jobId: string): Promise<{
  youtubeUrl: string | null
  instagramUrl: string | null
}> {
  const { data } = await supabaseAdmin
    .from('upload_attempts')
    .select('platform, status, platform_media_id, platform_url')
    .eq('job_id', jobId)
    .eq('status', 'uploaded')

  const rows = (data ?? []) as Array<{
    platform: string
    platform_media_id: string | null
    platform_url: string | null
  }>

  const pick = (platform: 'youtube' | 'instagram'): string | null => {
    for (const row of rows) {
      if (row.platform !== platform) continue
      const candidate = row.platform_url ?? row.platform_media_id
      if (isRealPlatformMediaId(platform, candidate)) return candidate
    }
    return null
  }

  return { youtubeUrl: pick('youtube'), instagramUrl: pick('instagram') }
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
  await driveStorage.delete(job.drive_file_id, job.id)

  await updateJobStatus(job.id, 'completed', {
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

  const bothUploaded =
    (youtubeStatus === 'uploaded' || youtubeStatus === 'verified') &&
    (instagramStatus === 'uploaded' || instagramStatus === 'verified')
  const anyFailed = youtubeStatus === 'failed' || instagramStatus === 'failed'
  const anyLoginRequired = youtubeStatus === 'login_required' || instagramStatus === 'login_required'

  if (bothUploaded) {
    const attemptsOk = await hasRecordedUploadAttempts(jobId)
    if (!attemptsOk) {
      logger.warn({ msg: 'Upload attempts missing platform confirmation', jobId })
      await handleUncertainVerification(job)
      return
    }

    try {
      await cleanupDriveFile(job)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error({ msg: 'Failed to cleanup Drive file before completion', jobId, error: message })
      throw err
    }

    await updateJobStatus(jobId, 'completed', {
      youtube_upload_status: 'verified',
      instagram_upload_status: 'verified',
      verification_status: 'verified',
      completed_at: new Date().toISOString(),
    })

    const { youtubeUrl, instagramUrl } = await getPublishedPlatformUrls(jobId)
    const urlParts = [
      youtubeUrl ? `YouTube: ${youtubeUrl}` : null,
      instagramUrl ? `Instagram: ${instagramUrl}` : null,
    ].filter(Boolean)

    await writeJobEvent(
      jobId,
      'verify',
      'verification_completed',
      urlParts.length > 0
        ? `Both platforms verified — ${urlParts.join(' | ')}`
        : 'Both platforms verified',
      'info',
      { youtubeUrl, instagramUrl },
    )

    await writeAuditLog({
      actorType: 'worker',
      action: 'job_verified',
      targetType: 'job',
      targetId: jobId,
      metadata: { youtubeUrl, instagramUrl },
    })

    return
  }

  if (anyLoginRequired) {
    await updateJobStatus(jobId, 'needs_manual_review', {
      failure_code:
        youtubeStatus === 'login_required'
          ? ERROR_CODES.YOUTUBE_LOGIN_REQUIRED
          : ERROR_CODES.INSTAGRAM_LOGIN_REQUIRED,
      failure_reason: 'Platform session requires login',
    })

    await writeJobEvent(jobId, 'verify', 'verification_login_required', 'Platform login required', 'warning')
    return
  }

  if (anyFailed) {
    const youtubeFailed = youtubeStatus === 'failed'
    const instagramFailed = instagramStatus === 'failed'
    const youtubeResult = platformOutcome(youtubeFailed, youtubeRetryCount)
    const instagramResult = platformOutcome(instagramFailed, instagramRetryCount)

    if (youtubeResult === 'manual' || instagramResult === 'manual') {
      const manualPlatform = youtubeResult === 'manual' ? 'youtube' : 'instagram'
      const attemptNumber = manualPlatform === 'youtube' ? youtubeRetryCount : instagramRetryCount
      const failureCode =
        manualPlatform === 'youtube' ? ERROR_CODES.YOUTUBE_UPLOAD_FAILED : ERROR_CODES.INSTAGRAM_UPLOAD_FAILED

      await updateJobStatus(job.id, 'needs_manual_review', {
        failure_code: failureCode,
        failure_reason: `${manualPlatform} upload failed after ${attemptNumber} attempts`,
      })

      await writeJobEvent(
        job.id,
        'verify',
        `${manualPlatform}_verification_failed`,
        `${manualPlatform} upload failed ${attemptNumber} times, manual review required`,
        'warning',
      )
      return
    }

    const updates: Record<string, unknown> = {}

    if (youtubeResult === 'retry') {
      updates.youtube_retry_count = youtubeRetryCount + 1
      updates.youtube_upload_status = 'retry_scheduled'
      await writeJobEvent(
        job.id,
        'verify',
        'youtube_retry_scheduled',
        `youtube upload failed, retry scheduled (attempt ${youtubeRetryCount + 1}/${MAX_RETRY_COUNT})`,
      )
    }

    if (instagramResult === 'retry') {
      updates.instagram_retry_count = instagramRetryCount + 1
      updates.instagram_upload_status = 'retry_scheduled'
      await writeJobEvent(
        job.id,
        'verify',
        'instagram_retry_scheduled',
        `instagram upload failed, retry scheduled (attempt ${instagramRetryCount + 1}/${MAX_RETRY_COUNT})`,
      )
    }

    if (Object.keys(updates).length > 0) {
      await updateJobStatus(job.id, 'ready_to_upload', updates)
    }

    return
  }

  await handleUncertainVerification(job)
}
