import { ERROR_CODES } from '@project-api/shared'

import { config } from '../config'
import { updateJobStatus } from '../db/jobsRepo'

import { MOCK_UPLOAD_FINAL_STATUS } from './statusTransitions'

type Platform = 'youtube' | 'instagram'
type UploadStatus = string | null | undefined

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

/**
 * Applies the correct job status after an upload or retry-upload attempt.
 * Both platforms uploaded → awaiting_verification.
 * Partial success → awaiting_verification (verifyJob schedules per-platform retry).
 * Login required or total failure → needs_manual_review.
 */
export async function finalizeUploadStatus(
  jobId: string,
  youtubeStatus: UploadStatus,
  instagramStatus: UploadStatus,
): Promise<string> {
  const bothUploaded = youtubeStatus === 'uploaded' && instagramStatus === 'uploaded'
  const anyLoginRequired = youtubeStatus === 'login_required' || instagramStatus === 'login_required'
  const anyUploaded = youtubeStatus === 'uploaded' || instagramStatus === 'uploaded'
  const anyFailed = youtubeStatus === 'failed' || instagramStatus === 'failed'

  if (bothUploaded) {
    await updateJobStatus(jobId, MOCK_UPLOAD_FINAL_STATUS, {
      uploaded_at: new Date().toISOString(),
      verification_due_at: new Date(Date.now() + config.VERIFY_DELAY_MINUTES * 60_000).toISOString(),
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
    await updateJobStatus(jobId, MOCK_UPLOAD_FINAL_STATUS, {
      uploaded_at: new Date().toISOString(),
      verification_due_at: new Date(Date.now() + config.VERIFY_DELAY_MINUTES * 60_000).toISOString(),
    })
    return MOCK_UPLOAD_FINAL_STATUS
  }

  await updateJobStatus(jobId, 'needs_manual_review', {
    failure_code: resolveUploadFailureCode(youtubeStatus, instagramStatus),
    failure_reason: 'One or more platform uploads failed',
  })
  return 'needs_manual_review'
}

/** Platforms that should be (re)uploaded on retry. */
export function platformsNeedingUpload(
  youtubeStatus: UploadStatus,
  instagramStatus: UploadStatus,
  requested?: Platform,
): Platform[] {
  if (requested === 'youtube') return ['youtube']
  if (requested === 'instagram') return ['instagram']

  const needs: Platform[] = []
  const retryable = new Set(['failed', 'retry_scheduled', 'uploading', 'pending'])

  if (retryable.has(youtubeStatus ?? 'pending')) needs.push('youtube')
  if (retryable.has(instagramStatus ?? 'pending')) needs.push('instagram')

  if (needs.length === 0) {
    return ['youtube', 'instagram']
  }

  return needs
}
