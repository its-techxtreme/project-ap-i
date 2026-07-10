import { ERROR_CODES, ProjectApiError } from '@project-api/shared'

import { getJobById, getNicheSlugById, updateJobStatus } from '../db/jobsRepo'
import { createUploadCoordinator } from '../uploaders'
import { logger } from '../logging/logger'

import { withUploadConcurrency } from './ConcurrencyGuard'
import { finalizeUploadStatus } from './uploadFinalize'
import { prepareLocalUploadFile } from './uploadLocalFile'

/**
 * Runs platform uploads for a job via UploadCoordinator.
 * Uses MockUploader when REAL_UPLOADS_ENABLED is false; Playwright uploaders when enabled.
 */
export async function runUpload(jobId: string): Promise<string> {
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

  const nicheSlug = await getNicheSlugById(job.niche_id)
  if (!nicheSlug) {
    throw new ProjectApiError(
      ERROR_CODES.NICHE_ACCOUNT_NOT_FOUND,
      `Niche slug not found for niche_id: ${job.niche_id}`,
      { stage: 'upload' },
    )
  }

  // Only mark platforms that still need work as uploading (preserve verified/uploaded).
  const ytNeeds =
    job.youtube_upload_status !== 'uploaded' && job.youtube_upload_status !== 'verified'
  const igNeeds =
    job.instagram_upload_status !== 'uploaded' && job.instagram_upload_status !== 'verified'

  await updateJobStatus(jobId, 'uploading', {
    ...(ytNeeds ? { youtube_upload_status: 'uploading' } : {}),
    ...(igNeeds ? { instagram_upload_status: 'uploading' } : {}),
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
    platformsToUpload.push('youtube', 'instagram')
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

/** @deprecated Use runUpload — kept for existing imports during Phase 10 transition */
export { runUpload as runMockUpload }
