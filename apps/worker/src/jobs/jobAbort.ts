import { ERROR_CODES } from '@project-api/shared'

import { getJobById, updateJobStatus, writeJobEvent } from '../db/jobsRepo'
import { supabaseAdmin } from '../db/supabaseAdmin'
import { logger } from '../logging/logger'

import { finalizeUploadStatus } from './uploadFinalize'

const ACTIVE_ABORT_STATUSES = new Set([
  'locked',
  'validating',
  'downloading',
  'downloaded',
  'processing',
  'processed',
  'staging_to_drive',
  'ready_to_upload',
  'uploading',
  'awaiting_verification',
])

export type JobControlState = 'active' | 'cancelled' | 'paused' | 'missing'

/** Cooperative abort check used between pipeline/upload stages. */
export async function getJobControlState(jobId: string): Promise<JobControlState> {
  const job = await getJobById(jobId)
  if (!job) return 'missing'
  if (job.status === 'cancelled') return 'cancelled'
  if (job.status === 'paused') return 'paused'
  return 'active'
}

export class JobAbortedError extends Error {
  constructor(
    readonly jobId: string,
    readonly control: 'cancelled' | 'paused',
  ) {
    super(`Job ${jobId} was ${control} by admin`)
    this.name = 'JobAbortedError'
  }
}

export async function assertJobNotAborted(jobId: string): Promise<void> {
  const state = await getJobControlState(jobId)
  if (state === 'cancelled' || state === 'paused') {
    throw new JobAbortedError(jobId, state)
  }
}

/**
 * Worker-side abort for admin cancel/pause mid-flight.
 * Clears locks, fails in-flight upload attempts, leaves terminal status as-is
 * when admin already set cancelled/paused.
 */
export async function abortJobLocally(jobId: string, workerId: string): Promise<void> {
  const job = await getJobById(jobId)
  if (!job) {
    throw new Error(`Job not found: ${jobId}`)
  }

  const nowIso = new Date().toISOString()

  await supabaseAdmin
    .from('upload_attempts')
    .update({
      status: 'failed',
      error_code: ERROR_CODES.JOB_ABORTED,
      error_message: 'Aborted by admin',
      finished_at: nowIso,
    })
    .eq('job_id', jobId)
    .eq('status', 'started')

  // If admin already set cancelled/paused, only clear locks.
  if (job.status === 'cancelled' || job.status === 'paused') {
    await supabaseAdmin
      .from('jobs')
      .update({
        locked_by: null,
        locked_at: null,
        lock_expires_at: null,
        updated_at: nowIso,
      })
      .eq('id', jobId)

    await writeJobEvent(
      jobId,
      'admin',
      'admin_abort_executed',
      `Worker cleared in-flight work for ${job.status} job`,
      'warning',
      { workerId, status: job.status },
    )
    logger.info({ msg: 'Abort honored for terminal control status', jobId, status: job.status })
    return
  }

  if (ACTIVE_ABORT_STATUSES.has(job.status) || job.status === 'uploading') {
    const yt = job.youtube_upload_status
    const ig = job.instagram_upload_status
    const ytNext =
      yt === 'uploading' || yt === 'pending' || yt === 'retry_scheduled' ? 'failed' : yt
    const igNext =
      ig === 'uploading' || ig === 'pending' || ig === 'retry_scheduled' ? 'failed' : ig

    await supabaseAdmin
      .from('jobs')
      .update({
        youtube_upload_status: ytNext,
        instagram_upload_status: igNext,
        locked_by: null,
        locked_at: null,
        lock_expires_at: null,
        failure_code: ERROR_CODES.JOB_ABORTED,
        failure_reason: 'Aborted by admin',
        updated_at: nowIso,
      })
      .eq('id', jobId)

    if (job.status === 'uploading') {
      await finalizeUploadStatus(jobId, ytNext, igNext)
    } else {
      await updateJobStatus(jobId, 'cancelled', {
        failure_code: ERROR_CODES.JOB_ABORTED,
        failure_reason: 'Aborted by admin',
        locked_by: null,
        locked_at: null,
        lock_expires_at: null,
      })
    }
  }

  await writeJobEvent(
    jobId,
    'admin',
    'admin_abort_executed',
    'Worker aborted in-flight job work',
    'warning',
    { workerId, previousStatus: job.status },
  )
  logger.warn({ msg: 'Job aborted locally', jobId, workerId, previousStatus: job.status })
}
