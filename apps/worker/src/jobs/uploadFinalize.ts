import { ERROR_CODES } from '@project-api/shared'

import { config } from '../config'
import { updateJobStatus } from '../db/jobsRepo'

import { MOCK_UPLOAD_FINAL_STATUS } from './statusTransitions'

type Platform = 'youtube' | 'instagram'
type UploadStatus = string | null | undefined

/** uploaded = just published; verified = already confirmed earlier (e.g. IG-only recovery). */
function isUploadSuccess(status: UploadStatus): boolean {
  return status === 'uploaded' || status === 'verified'
}

function resolveLoginFailureCode(
  youtubeStatus: UploadStatus,
  instagramStatus: UploadStatus,
): string {
  if (youtubeStatus === 'login_required') return ERROR_CODES.YOUTUBE_LOGIN_REQUIRED
  if (instagramStatus === 'login_required') return ERROR_CODES.INSTAGRAM_LOGIN_REQUIRED
  return ERROR_CODES.YOUTUBE_LOGIN_REQUIRED
}

function resolveUploadFailureCode(
  youtubeStatus: UploadStatus,
  instagramStatus: UploadStatus,
): string {
  if (youtubeStatus === 'failed' && instagramStatus !== 'failed') {
    return ERROR_CODES.YOUTUBE_UPLOAD_FAILED
  }
  if (instagramStatus === 'failed' && youtubeStatus !== 'failed') {
    return ERROR_CODES.INSTAGRAM_UPLOAD_FAILED
  }
  return ERROR_CODES.YOUTUBE_UPLOAD_FAILED
}

/** After upload/retry. Both ok → verify delay. Partial → short due for the failed side. Login → review. Total fail → short due so verify can retry. */
export async function finalizeUploadStatus(
  jobId: string,
  youtubeStatus: UploadStatus,
  instagramStatus: UploadStatus,
): Promise<string> {
  const bothUploaded = isUploadSuccess(youtubeStatus) && isUploadSuccess(instagramStatus)
  const anyLoginRequired = youtubeStatus === 'login_required' || instagramStatus === 'login_required'
  const anyUploaded = isUploadSuccess(youtubeStatus) || isUploadSuccess(instagramStatus)
  const anyFailed = youtubeStatus === 'failed' || instagramStatus === 'failed'

  if (bothUploaded) {
    await updateJobStatus(jobId, MOCK_UPLOAD_FINAL_STATUS, {
      uploaded_at: new Date().toISOString(),
      verification_due_at: new Date(Date.now() + config.VERIFY_DELAY_MINUTES * 60_000).toISOString(),
      failure_code: null,
      failure_reason: null,
    })
    return MOCK_UPLOAD_FINAL_STATUS
  }

  if (anyLoginRequired) {
    await updateJobStatus(jobId, 'needs_manual_review', {
      failure_code: resolveLoginFailureCode(youtubeStatus, instagramStatus),
      failure_reason: 'Platform session requires login',
    })
    return 'needs_manual_review'
  }

  if (anyUploaded && anyFailed) {
    // Partial success: enter verification early so WF-08 can schedule platform retries
    // without waiting the full VERIFY_DELAY_MINUTES (failed side needs faster recovery).
    const partialRetryMinutes = Math.min(2, config.VERIFY_DELAY_MINUTES)
    await updateJobStatus(jobId, MOCK_UPLOAD_FINAL_STATUS, {
      uploaded_at: new Date().toISOString(),
      verification_due_at: new Date(Date.now() + partialRetryMinutes * 60_000).toISOString(),
      failure_code: resolveUploadFailureCode(youtubeStatus, instagramStatus),
      failure_reason: 'Partial platform upload failure — retry scheduled via verification',
    })
    return MOCK_UPLOAD_FINAL_STATUS
  }

  // Total failure: still park in awaiting_verification with a short due time so the
  // automated verify→retry path can recover transient Playwright failures.
  await updateJobStatus(jobId, MOCK_UPLOAD_FINAL_STATUS, {
    failure_code: resolveUploadFailureCode(youtubeStatus, instagramStatus),
    failure_reason: 'One or more platform uploads failed',
    verification_due_at: new Date(Date.now() + 2 * 60_000).toISOString(),
  })
  return MOCK_UPLOAD_FINAL_STATUS
}

/** Platforms that should be (re)uploaded on retry. */
export function platformsNeedingUpload(
  youtubeStatus: UploadStatus,
  instagramStatus: UploadStatus,
  requested?: Platform,
): Platform[] {
  // login_required must be retryable after admin recovers the browser session.
  const retryable = new Set([
    'failed',
    'retry_scheduled',
    'uploading',
    'pending',
    'login_required',
  ])
  const needs = (status: UploadStatus) => retryable.has(status ?? 'pending')

  if (requested === 'youtube') {
    return needs(youtubeStatus) ? ['youtube'] : []
  }
  if (requested === 'instagram') {
    return needs(instagramStatus) ? ['instagram'] : []
  }

  const out: Platform[] = []
  if (needs(youtubeStatus)) out.push('youtube')
  if (needs(instagramStatus)) out.push('instagram')

  // Never fall back to re-uploading successful platforms — that caused duplicate posts
  // when WF-08 drained stale retry-upload requests after a job already succeeded.
  return out
}
