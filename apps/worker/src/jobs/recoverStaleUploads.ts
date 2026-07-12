import { config } from '../config'
import { supabaseAdmin } from '../db/supabaseAdmin'
import { writeJobEvent } from '../db/jobsRepo'
import { logger } from '../logging/logger'

import { finalizeUploadStatus } from './uploadFinalize'

type Platform = 'youtube' | 'instagram'

function isSuccessStatus(status: string | null | undefined): boolean {
  return status === 'uploaded' || status === 'verified'
}

function isInflightStatus(status: string | null | undefined): boolean {
  return status === 'uploading' || status === 'started'
}

/**
 * Recover jobs left in `uploading` after a worker crash/hang.
 * Fails stale in-flight platform attempts, clears locks, and finalizes so
 * verify/retry can resume (especially YT-done / IG-stuck cases).
 */
export async function recoverStaleUploadingJobs(workerId: string): Promise<number> {
  const staleMs = config.UPLOAD_STALE_THRESHOLD_MS
  const cutoff = new Date(Date.now() - staleMs).toISOString()
  const nowIso = new Date().toISOString()

  const { data: rows, error } = await supabaseAdmin
    .from('jobs')
    .select(
      'id, status, youtube_upload_status, instagram_upload_status, locked_by, lock_expires_at, updated_at',
    )
    .eq('status', 'uploading')
    .limit(25)

  if (error) {
    logger.warn({ msg: 'Failed to query stale uploading jobs', error: error.message })
    return 0
  }

  let recovered = 0
  for (const row of rows ?? []) {
    const job = row as {
      id: string
      youtube_upload_status: string | null
      instagram_upload_status: string | null
      lock_expires_at: string | null
      updated_at: string
    }

    const lockExpired = !job.lock_expires_at || job.lock_expires_at <= nowIso
    const updatedStale = job.updated_at <= cutoff
    if (!lockExpired && !updatedStale) continue

    const ytInflight = isInflightStatus(job.youtube_upload_status)
    const igInflight = isInflightStatus(job.instagram_upload_status)
    if (!ytInflight && !igInflight) {
      // Job marked uploading but platforms already settled — just finalize.
      await finalizeAndClearLock(job.id, job.youtube_upload_status, job.instagram_upload_status)
      recovered += 1
      continue
    }

    const platforms: Platform[] = []
    if (ytInflight) platforms.push('youtube')
    if (igInflight) platforms.push('instagram')

    for (const platform of platforms) {
      await failStaleAttempts(job.id, platform)
      const statusField =
        platform === 'youtube' ? 'youtube_upload_status' : 'instagram_upload_status'
      await supabaseAdmin
        .from('jobs')
        .update({ [statusField]: 'failed', updated_at: nowIso })
        .eq('id', job.id)
    }

    const latest = await supabaseAdmin
      .from('jobs')
      .select('youtube_upload_status, instagram_upload_status')
      .eq('id', job.id)
      .single()

    const ytStatus = (latest.data as { youtube_upload_status?: string } | null)?.youtube_upload_status
      ?? (ytInflight ? 'failed' : job.youtube_upload_status)
    const igStatus =
      (latest.data as { instagram_upload_status?: string } | null)?.instagram_upload_status
      ?? (igInflight ? 'failed' : job.instagram_upload_status)

    await finalizeAndClearLock(job.id, ytStatus, igStatus)

    await writeJobEvent(
      job.id,
      'upload',
      'stale_upload_recovered',
      `Recovered stale uploading job (platforms: ${platforms.join(', ')})`,
      'warning',
      {
        workerId,
        staleMs,
        platforms,
        youtubeWas: job.youtube_upload_status,
        instagramWas: job.instagram_upload_status,
        lockExpired,
        updatedStale,
      },
    )

    logger.warn({
      msg: 'Recovered stale uploading job',
      jobId: job.id,
      workerId,
      platforms,
      youtubeWas: job.youtube_upload_status,
      instagramWas: job.instagram_upload_status,
    })
    recovered += 1
  }

  return recovered
}

async function failStaleAttempts(jobId: string, platform: Platform): Promise<void> {
  await supabaseAdmin
    .from('upload_attempts')
    .update({
      status: 'failed',
      error_code: platform === 'youtube' ? 'YOUTUBE_UPLOAD_FAILED' : 'INSTAGRAM_UPLOAD_FAILED',
      error_message: 'Upload attempt abandoned — worker crash or stale timeout',
      finished_at: new Date().toISOString(),
    })
    .eq('job_id', jobId)
    .eq('platform', platform)
    .eq('status', 'started')
}

async function finalizeAndClearLock(
  jobId: string,
  youtubeStatus: string | null | undefined,
  instagramStatus: string | null | undefined,
): Promise<void> {
  await supabaseAdmin
    .from('jobs')
    .update({
      locked_by: null,
      locked_at: null,
      lock_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)

  // Preserve successful sides; only fail inflight sides before finalize.
  const yt = isSuccessStatus(youtubeStatus) ? youtubeStatus : youtubeStatus === 'failed' ? 'failed' : youtubeStatus
  const ig = isSuccessStatus(instagramStatus)
    ? instagramStatus
    : instagramStatus === 'failed'
      ? 'failed'
      : instagramStatus

  await finalizeUploadStatus(jobId, yt, ig)
}
