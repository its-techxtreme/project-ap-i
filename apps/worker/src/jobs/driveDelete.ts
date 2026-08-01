import type { JobStatus } from '@project-api/shared'
import { ERROR_CODES, ProjectApiError } from '@project-api/shared'

import type { DbJobRow } from '../db/jobsRepo'
import { getJobById, updateJobStatus, writeAuditLog } from '../db/jobsRepo'
import type { DriveStorage } from '../storage/types'

const DRIVE_DELETE_ALLOWED_STATUSES: JobStatus[] = [
  'failed',
  'needs_manual_review',
  'completed',
  'cancelled',
  'ignored',
  'paused',
]

export async function deleteJobDriveFile(
  jobId: string,
  driveStorage: DriveStorage,
): Promise<{ driveFileId: string }> {
  const job = await getJobById(jobId)
  if (!job) {
    throw new ProjectApiError(ERROR_CODES.JOB_NOT_FOUND, `Job not found: ${jobId}`)
  }

  if (!DRIVE_DELETE_ALLOWED_STATUSES.includes(job.status)) {
    throw new ProjectApiError(
      ERROR_CODES.DRIVE_DELETE_FAILED,
      `Drive delete not allowed for job status: ${job.status}`,
    )
  }

  if (!job.drive_file_id) {
    throw new ProjectApiError(
      ERROR_CODES.DRIVE_DELETE_FAILED,
      `Job ${jobId} has no Drive file to delete`,
    )
  }

  if (job.drive_folder_state === 'deleted') {
    return { driveFileId: job.drive_file_id }
  }

  await driveStorage.delete(job.drive_file_id, jobId)

  await updateJobStatus(jobId, job.status, {
    drive_folder_state: 'deleted',
    drive_deleted_at: new Date().toISOString(),
  })

  await writeAuditLog({
    actorType: 'worker',
    action: 'drive_deleted',
    targetType: 'job',
    targetId: jobId,
    metadata: { drive_file_id: job.drive_file_id },
  })

  return { driveFileId: job.drive_file_id }
}

/** Returns true when a job retains its Drive file (not auto-deleted). */
export function shouldRetainDriveFile(job: DbJobRow): boolean {
  if (!job.drive_file_id) return false
  if (job.drive_folder_state === 'deleted') return false
  return job.status === 'failed' || job.status === 'needs_manual_review' || job.status === 'paused'
}
