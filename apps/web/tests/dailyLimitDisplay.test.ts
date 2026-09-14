import { describe, expect, it } from 'vitest'

import {
  DAILY_UPLOAD_WINDOW_MS,
  displayFailureReason,
  isActiveDailyUploadLimit,
} from '@/lib/jobs/dailyLimitDisplay'

describe('daily limit display', () => {
  it('hides yesterday\'s parked limit once the 24h window has passed', () => {
    const now = Date.parse('2026-09-12T16:00:00.000Z')
    const job = {
      failure_code: 'DAILY_UPLOAD_LIMIT_REACHED',
      failure_reason: 'Daily upload limit reached (5/account per rolling 24h).',
      updated_at: new Date(now - DAILY_UPLOAD_WINDOW_MS - 60_000).toISOString(),
    }
    expect(isActiveDailyUploadLimit(job, now)).toBe(false)
    expect(displayFailureReason(job, now)).toBeNull()
  })

  it('keeps the badge while the window is still open', () => {
    const now = Date.parse('2026-09-12T16:00:00.000Z')
    const job = {
      failure_code: 'DAILY_UPLOAD_LIMIT_REACHED',
      failure_reason: 'Daily upload limit reached',
      updated_at: new Date(now - 3_600_000).toISOString(),
    }
    expect(isActiveDailyUploadLimit(job, now)).toBe(true)
    expect(displayFailureReason(job, now)).toBe('Daily upload limit reached')
  })

  it('hides Force after the job is paused', () => {
    const now = Date.parse('2026-09-12T16:00:00.000Z')
    const job = {
      status: 'paused',
      failure_code: 'DAILY_UPLOAD_LIMIT_REACHED',
      failure_reason: 'Paused by admin (was ready_to_upload)',
      updated_at: new Date(now - 3_600_000).toISOString(),
    }
    expect(isActiveDailyUploadLimit(job, now)).toBe(false)
    expect(displayFailureReason(job, now)).toBe('Paused by admin (was ready_to_upload)')
  })
})
