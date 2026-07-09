import { ERROR_CODES, ProjectApiError } from '@project-api/shared'
import { getJobById, getNicheSlugById, updateJobStatus, writeJobEvent, writeAuditLog } from '../db/jobsRepo'
import { createUploadCoordinator } from '../uploaders'
import { logger } from '../logging/logger'

import { finalizeUploadStatus, platformsNeedingUpload } from './uploadFinalize'
import { prepareLocalUploadFile } from './uploadLocalFile'

export async function retryJob(jobId: string, platform?: 'youtube' | 'instagram'): Promise<void> {
  const job = await getJobById(jobId)
  if (!job) {
    throw new ProjectApiError(ERROR_CODES.JOB_NOT_FOUND, `Job not found: ${jobId}`)
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

  const retryableStatuses = ['failed', 'needs_manual_review', 'ready_to_upload', 'awaiting_verification']
  if (!retryableStatuses.includes(job.status)) {
    throw new ProjectApiError(
      ERROR_CODES.JOB_NOT_FOUND,
      `Job status ${job.status} is not retryable`,
    )
  }

  const targets = platformsNeedingUpload(
    job.youtube_upload_status,
    job.instagram_upload_status,
    platform,
  )

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
