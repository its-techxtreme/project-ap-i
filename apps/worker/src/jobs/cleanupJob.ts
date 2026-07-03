import { ERROR_CODES, ProjectApiError } from '@project-api/shared'
import { getJobById, updateJobStatus, writeJobEvent, writeAuditLog } from '../db/jobsRepo'
import { createDriveStorage } from '../storage'
import { logger } from '../logging/logger'

/**
 * Drive cleanup - called only after BOTH platforms are verified.
 * 1. Call driveStorage.delete(job.drive_file_id, job.id)
 * 2. Update job: drive_folder_state = 'deleted', drive_deleted_at = now()
 * 3. Write job_events: drive_deleted
 * 4. Write audit_logs: drive_deleted, actor_type = 'worker'
 * 5. Update job status: 'completed'
 */
export async function cleanupJob(jobId: string): Promise<{ driveFileId: string }> {
  const job = await getJobById(jobId)
  if (!job) {
    throw new ProjectApiError(ERROR_CODES.JOB_NOT_FOUND, `Job not found: ${jobId}`)
  }

  // Verify both platforms are verified
  const youtubeVerified = job.youtube_upload_status === 'verified'
  const instagramVerified = job.instagram_upload_status === 'verified'

  if (!youtubeVerified || !instagramVerified) {
    throw new ProjectApiError(
      ERROR_CODES.VERIFICATION_FAILED,
      `Cannot cleanup: YouTube verified=${youtubeVerified}, Instagram verified=${instagramVerified}`,
    )
  }

  if (!job.drive_file_id) {
    throw new ProjectApiError(
      ERROR_CODES.DRIVE_DELETE_FAILED,
      `Job ${jobId} has no Drive file to cleanup`,
    )
  }

  if (job.drive_folder_state === 'deleted') {
    logger.info({ msg: 'Drive file already deleted', jobId: job.id, driveFileId: job.drive_file_id })
    return { driveFileId: job.drive_file_id }
  }

  const driveStorage = createDriveStorage()

  try {
    await driveStorage.delete(job.drive_file_id, jobId)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error({ msg: 'Failed to delete Drive file', jobId: job.id, driveFileId: job.drive_file_id, error: message })
    throw new ProjectApiError(
      ERROR_CODES.DRIVE_DELETE_FAILED,
      `Failed to delete Drive file: ${message}`,
    )
  }

  await updateJobStatus(jobId, 'completed', {
    drive_folder_state: 'deleted',
    drive_deleted_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  })

  await writeJobEvent(jobId, 'cleanup', 'drive_deleted', 'Drive file deleted after successful verification')

  await writeAuditLog({
    actorType: 'worker',
    action: 'drive_deleted',
    targetType: 'job',
    targetId: jobId,
    metadata: { drive_file_id: job.drive_file_id },
  })

  logger.info({ msg: 'Drive cleanup completed', jobId: job.id, driveFileId: job.drive_file_id })

  return { driveFileId: job.drive_file_id }
}