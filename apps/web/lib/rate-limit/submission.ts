/**
 * In-memory submission rate limiter (MVP).
 * Replace with Redis-backed limiter in Phase 16 for multi-instance deployments.
 */
const ONE_MINUTE_MS = 60_000
const ONE_DAY_MS = 24 * 60 * 60 * 1000
const MAX_PER_MINUTE = 5
const MAX_PER_DAY = 20

const submissionTimestamps = new Map<string, number[]>()

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; error: string }

export function checkSubmissionRateLimit(userId: string): RateLimitResult {
  const now = Date.now()
  const timestamps = (submissionTimestamps.get(userId) ?? []).filter(
    (ts) => now - ts < ONE_DAY_MS,
  )

  const recentMinute = timestamps.filter((ts) => now - ts < ONE_MINUTE_MS)

  if (recentMinute.length >= MAX_PER_MINUTE) {
    return {
      allowed: false,
      error: 'Submission limit reached. Please wait before trying again.',
    }
  }

  if (timestamps.length >= MAX_PER_DAY) {
    return {
      allowed: false,
      error: 'Submission limit reached. Please wait before trying again.',
    }
  }

  return { allowed: true }
}

export function recordSubmission(userId: string): void {
  const now = Date.now()
  const timestamps = (submissionTimestamps.get(userId) ?? []).filter(
    (ts) => now - ts < ONE_DAY_MS,
  )
  timestamps.push(now)
  submissionTimestamps.set(userId, timestamps)
}

/** Reset in-memory state — for tests only. */
export function resetSubmissionRateLimits(): void {
  submissionTimestamps.clear()
}
