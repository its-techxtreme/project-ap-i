/** Rolling 24h, same window the worker uses for daily upload caps. */
export const DAILY_UPLOAD_WINDOW_MS = 24 * 60 * 60 * 1000

export function looksLikeDailyUploadLimit(job: {
  failure_code?: string | null
  failure_reason?: string | null
}): boolean {
  if (job.failure_code === 'DAILY_UPLOAD_LIMIT_REACHED') return true
  const reason = (job.failure_reason ?? '').toLowerCase()
  return reason.includes('daily upload limit')
}

/** True only while the 24h window from last stamp is still open. Old parked jobs drop the badge. */
export function isActiveDailyUploadLimit(
  job: {
    failure_code?: string | null
    failure_reason?: string | null
    updated_at?: string | null
  },
  nowMs = Date.now(),
): boolean {
  if (!looksLikeDailyUploadLimit(job)) return false
  const stamp = job.updated_at ? Date.parse(job.updated_at) : Number.NaN
  if (!Number.isFinite(stamp)) return true
  return nowMs - stamp < DAILY_UPLOAD_WINDOW_MS
}

export function displayFailureReason(
  job: {
    failure_code?: string | null
    failure_reason?: string | null
    updated_at?: string | null
  },
  nowMs = Date.now(),
): string | null {
  if (!job.failure_reason) return null
  if (looksLikeDailyUploadLimit(job) && !isActiveDailyUploadLimit(job, nowMs)) return null
  return job.failure_reason
}
