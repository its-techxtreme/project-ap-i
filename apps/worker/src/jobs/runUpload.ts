import { ERROR_CODES, ProjectApiError } from '@project-api/shared'

import { config } from '../config'
import { getJobById, getNicheSlugById, updateJobStatus } from '../db/jobsRepo'
import { createUploadCoordinator } from '../uploaders'
import { logger } from '../logging/logger'

import { MOCK_UPLOAD_FINAL_STATUS } from './statusTransitions'

/**
 * Runs mock platform uploads for a job via UploadCoordinator.
 * Returns { blocked: true } when REAL_UPLOADS_ENABLED is set (Playwright not implemented yet).
 */
export async function runUpload(jobId: string): Promise<string | { blocked: true }> {
  if (config.REAL_UPLOADS_ENABLED) {
    return { blocked: true }
  }

  const job = await getJobById(jobId)
  if (!job) {
    throw new ProjectApiError(ERROR_CODES.JOB_NOT_FOUND, `Job not found: ${jobId}`, { stage: 'upload' })
  }

  if (!job.drive_file_id) {
    throw new ProjectApiError(ERROR_CODES.DRIVE_UPLOAD_FAILED, 'Job has no staged Drive file', {
      stage: 'upload',
    })
  }

  const nicheSlug = await getNicheSlugById(job.niche_id)
  if (!nicheSlug) {
    throw new ProjectApiError(
      ERROR_CODES.NICHE_ACCOUNT_NOT_FOUND,
      `Niche slug not found for niche_id: ${job.niche_id}`,
      { stage: 'upload' },
    )
  }

  await updateJobStatus(jobId, 'uploading', {
    youtube_upload_status: 'uploading',
    instagram_upload_status: 'uploading',
  })

  const coordinator = createUploadCoordinator()

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
    })
  } catch (err) {
    if (err instanceof ProjectApiError && err.code === ERROR_CODES.NICHE_ACCOUNT_MAPPING_INVALID) {
      logger.warn({ msg: 'Upload blocked by invalid account mapping', jobId, error: err.message })
      throw err
    }
    throw err
  }

  const updatedJob = await getJobById(jobId)
  const youtubeStatus = updatedJob?.youtube_upload_status
  const instagramStatus = updatedJob?.instagram_upload_status

  if (youtubeStatus === 'uploaded' && instagramStatus === 'uploaded') {
    await updateJobStatus(jobId, MOCK_UPLOAD_FINAL_STATUS, {
      uploaded_at: new Date().toISOString(),
      verification_due_at: new Date(Date.now() + config.VERIFY_DELAY_MINUTES * 60_000).toISOString(),
    })
    return MOCK_UPLOAD_FINAL_STATUS
  }

  if (youtubeStatus === 'login_required' || instagramStatus === 'login_required') {
    await updateJobStatus(jobId, 'needs_manual_review', {
      failure_code: ERROR_CODES.YOUTUBE_LOGIN_REQUIRED,
      failure_reason: 'Platform session requires login',
    })
    return 'needs_manual_review'
  }

  await updateJobStatus(jobId, 'needs_manual_review', {
    failure_code: ERROR_CODES.YOUTUBE_UPLOAD_FAILED,
    failure_reason: 'One or more platform uploads failed',
  })
  return 'needs_manual_review'
}

/** @deprecated Use runUpload — kept for existing imports during Phase 10 transition */
export { runUpload as runMockUpload }
