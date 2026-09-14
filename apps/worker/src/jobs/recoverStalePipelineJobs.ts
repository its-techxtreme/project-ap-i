import { config } from '../config'
import { supabaseAdmin } from '../db/supabaseAdmin'
import { writeJobEvent } from '../db/jobsRepo'
import { logger } from '../logging/logger'

const MID_PIPELINE_STATUSES = [
  'locked',
  'validating',
  'downloading',
  'downloaded',
  'processing',
  'processed',
  'staging_to_drive',
  'ready_to_upload',
] as const

/** Mid-pipeline stuck after crash (not uploading). Drop locks and requeue. If it already has PIPELINE_STALE, fail it. */
export async function recoverStalePipelineJobs(workerId: string): Promise<number> {
  const staleMs = config.PIPELINE_STALE_THRESHOLD_MS
  const cutoff = new Date(Date.now() - staleMs).toISOString()
  const nowIso = new Date().toISOString()

  const { data: rows, error } = await supabaseAdmin
    .from('jobs')
    .select('id, status, locked_by, lock_expires_at, updated_at, failure_code, retry_count')
    .in('status', [...MID_PIPELINE_STATUSES])
    .limit(40)

  if (error) {
    logger.warn({ msg: 'Failed to query stale pipeline jobs', error: error.message })
    return 0
  }

  let recovered = 0
  for (const row of rows ?? []) {
    const job = row as {
      id: string
      status: string
      lock_expires_at: string | null
      updated_at: string
      failure_code: string | null
      retry_count: number | null
    }

    const lockExpired = !job.lock_expires_at || job.lock_expires_at <= nowIso
    const updatedStale = job.updated_at <= cutoff
    if (!lockExpired && !updatedStale) continue

    // Idle ready_to_upload (no lock) waits for the upload poller — do not requeue.
    if (job.status === 'ready_to_upload' && !(row as { locked_by?: string | null }).locked_by) {
      continue
    }

    const alreadyStale = job.failure_code === 'PIPELINE_STALE'
    const nextStatus = alreadyStale ? 'failed' : 'queued'

    await supabaseAdmin
      .from('jobs')
      .update({
        status: nextStatus,
        locked_by: null,
        locked_at: null,
        lock_expires_at: null,
        failure_code: alreadyStale ? 'PIPELINE_STALE' : 'PIPELINE_STALE',
        failure_reason: alreadyStale
          ? 'Pipeline stalled repeatedly after reclaim — marked failed'
          : 'Pipeline stalled (lock expired or no progress) — requeued',
        retry_count: alreadyStale ? (job.retry_count ?? 0) : (job.retry_count ?? 0) + 1,
        updated_at: nowIso,
      })
      .eq('id', job.id)

    await writeJobEvent(
      job.id,
      'claim',
      'stale_pipeline_recovered',
      alreadyStale
        ? `Stale pipeline job failed after repeated reclaim (was ${job.status})`
        : `Stale pipeline job requeued (was ${job.status})`,
      'warning',
      {
        workerId,
        staleMs,
        previousStatus: job.status,
        nextStatus,
        lockExpired,
        updatedStale,
      },
    )

    logger.warn({
      msg: 'Recovered stale pipeline job',
      jobId: job.id,
      workerId,
      previousStatus: job.status,
      nextStatus,
    })
    recovered += 1
  }

  return recovered
}
