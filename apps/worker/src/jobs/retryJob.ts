import { ERROR_CODES, ProjectApiError } from '@project-api/shared'
import { getJobById, getNicheSlugById, updateJobStatus, writeJobEvent, writeAuditLog } from '../db/jobsRepo'
import { createUploadCoordinator } from '../uploaders'
import { logger } from '../logging/logger'

export async function retryJob(jobId: string, platform?: 'youtube' | 'instagram'): Promise<void> {
  const job = await getJobById(jobId)
  if (!job) {
    throw new ProjectApiError(ERROR_CODES.JOB_NOT_FOUND, `Job not found: ${jobId}`)
  }

  // Verify Drive file still exists
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

  // Check job status is retryable
  const retryableStatuses = ['failed', 'needs_manual_review', 'ready_to_upload', 'awaiting_verification']
  if (!retryableStatuses.includes(job.status)) {
    throw new ProjectApiError(
      ERROR_CODES.JOB_NOT_FOUND,
      `Job status ${job.status} is not retryable`,
    )
  }

  logger.info({ msg: 'Starting retry upload', jobId, platform })

  // Increment retry count for the specific platform
  if (platform === 'youtube') {
    await updateJobStatus(job.id, job.status, {
      youtube_retry_count: job.youtube_retry_count + 1,
      youtube_upload_status: 'retry_scheduled',
    })
  } else if (platform === 'instagram') {
    await updateJobStatus(job.id, job.status, {
      instagram_retry_count: job.instagram_retry_count + 1,
      instagram_upload_status: 'retry_scheduled',
    })
  } else {
    // Retry both platforms
    await updateJobStatus(job.id, job.status, {
      youtube_retry_count: job.youtube_retry_count + 1,
      instagram_retry_count: job.instagram_retry_count + 1,
      youtube_upload_status: 'retry_scheduled',
      instagram_upload_status: 'retry_scheduled',
    })
  }

  await writeJobEvent(job.id, 'retry', 'retry_upload_started', `Retry upload started for ${platform ?? 'both'} platform(s)`)

  // Get niche slug
  const nicheSlug = await getNicheSlugById(job.niche_id)
  if (!nicheSlug) {
    throw new ProjectApiError(
      ERROR_CODES.NICHE_ACCOUNT_NOT_FOUND,
      `Niche slug not found for niche_id: ${job.niche_id}`,
    )
  }

  const coordinator = createUploadCoordinator()

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
  })

  // Write audit log for manual retry
  await writeAuditLog({
    actorType: 'admin',
    action: 'manual_retry_requested',
    targetType: 'job',
    targetId: jobId,
    metadata: { platform: platform ?? 'both' },
  })
}