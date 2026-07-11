import { DEFAULTS, ERROR_CODES, ProjectApiError } from '@project-api/shared'

import { config } from '../config'
import { supabaseAdmin } from '../db/supabaseAdmin'
import { logger } from '../logging/logger'
import { resolveNicheAccounts } from '../uploaders/accountResolver'

export type DailyLimitPlatform = 'youtube' | 'instagram'

/** Rolling window matching platform daily caps (not calendar/UTC midnight). */
export const DAILY_UPLOAD_WINDOW_MS = 24 * 60 * 60 * 1000

export interface DailyUploadUsage {
  accountId: string
  platform: DailyLimitPlatform
  accountLabel?: string
  used: number
  limit: number
  remaining: number
}

export interface DailyUploadLimitCheck {
  blocked: boolean
  limit: number
  blockedPlatforms: DailyUploadUsage[]
  usages: DailyUploadUsage[]
}

/** Start of the rolling 24-hour window (platform daily limits reset ~24h after uploads). */
export function rollingWindowStartIso(now = new Date()): string {
  return new Date(now.getTime() - DAILY_UPLOAD_WINDOW_MS).toISOString()
}

/** @deprecated Use rollingWindowStartIso — kept for older test imports. */
export function utcDayStartIso(now = new Date()): string {
  return rollingWindowStartIso(now)
}

export function getDailyUploadLimit(): number {
  const n = config.DAILY_UPLOAD_LIMIT_PER_ACCOUNT
  if (!Number.isFinite(n) || n <= 0) return DEFAULTS.DAILY_UPLOAD_LIMIT_PER_ACCOUNT
  return Math.floor(n)
}

/** Detect platform UI / error copy for daily upload quota. */
export function isDailyUploadLimitError(message?: string | null): boolean {
  if (!message) return false
  const m = message.toLowerCase()
  return (
    m.includes('daily upload limit') ||
    m.includes('upload limit reached') ||
    m.includes('upload limit has been reached') ||
    m.includes("you've reached the daily") ||
    m.includes('you have reached the daily')
  )
}

/**
 * Count distinct successful uploads for an account in the last 24 hours,
 * plus in-flight uploads currently marked uploading for that account.
 */
export async function countAccountUploadsToday(
  accountId: string,
  platform: DailyLimitPlatform,
): Promise<number> {
  const windowStart = rollingWindowStartIso()

  const { data: attempts, error: attemptsError } = await supabaseAdmin
    .from('upload_attempts')
    .select('job_id')
    .eq('platform_account_id', accountId)
    .eq('platform', platform)
    .eq('status', 'uploaded')
    .gte('finished_at', windowStart)

  if (attemptsError) {
    logger.warn({
      msg: 'Failed to count daily upload attempts',
      accountId,
      platform,
      error: attemptsError.message,
    })
  }

  const successJobIds = new Set(
    (attempts ?? [])
      .map((row) => (row as { job_id?: string }).job_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  )

  const accountColumn =
    platform === 'youtube' ? 'target_youtube_account_id' : 'target_instagram_account_id'
  const statusColumn = platform === 'youtube' ? 'youtube_upload_status' : 'instagram_upload_status'

  const { data: inflight, error: inflightError } = await supabaseAdmin
    .from('jobs')
    .select('id')
    .eq(accountColumn, accountId)
    .eq('status', 'uploading')
    .eq(statusColumn, 'uploading')

  if (inflightError) {
    logger.warn({
      msg: 'Failed to count in-flight daily uploads',
      accountId,
      platform,
      error: inflightError.message,
    })
  }

  for (const row of inflight ?? []) {
    const id = (row as { id?: string }).id
    if (typeof id === 'string' && id.length > 0) successJobIds.add(id)
  }

  return successJobIds.size
}

export async function checkDailyUploadLimitsForAccounts(
  accounts: {
    youtube: { id: string; accountLabel?: string }
    instagram: { id: string; accountLabel?: string }
  },
  needed: { youtube?: boolean; instagram?: boolean } = { youtube: true, instagram: true },
): Promise<DailyUploadLimitCheck> {
  const limit = getDailyUploadLimit()
  const usages: DailyUploadUsage[] = []

  if (needed.youtube !== false) {
    const used = await countAccountUploadsToday(accounts.youtube.id, 'youtube')
    usages.push({
      accountId: accounts.youtube.id,
      platform: 'youtube',
      accountLabel: accounts.youtube.accountLabel,
      used,
      limit,
      remaining: Math.max(0, limit - used),
    })
  }

  if (needed.instagram !== false) {
    const used = await countAccountUploadsToday(accounts.instagram.id, 'instagram')
    usages.push({
      accountId: accounts.instagram.id,
      platform: 'instagram',
      accountLabel: accounts.instagram.accountLabel,
      used,
      limit,
      remaining: Math.max(0, limit - used),
    })
  }

  const blockedPlatforms = usages.filter((u) => u.used >= limit)
  return {
    blocked: blockedPlatforms.length > 0,
    limit,
    blockedPlatforms,
    usages,
  }
}

/** Resolve niche accounts and check whether any needed platform is at the daily cap. */
export async function checkNicheDailyUploadLimits(
  nicheId: string,
  needed: { youtube?: boolean; instagram?: boolean } = { youtube: true, instagram: true },
): Promise<DailyUploadLimitCheck> {
  const accounts = await resolveNicheAccounts(nicheId)
  return checkDailyUploadLimitsForAccounts(accounts, needed)
}

export function dailyLimitDeferMessage(check: DailyUploadLimitCheck): string {
  const parts = check.blockedPlatforms.map(
    (p) =>
      `${p.platform}${p.accountLabel ? ` (${p.accountLabel})` : ''}: ${p.used}/${p.limit} in last 24h`,
  )
  return `Daily upload limit reached (${check.limit}/account per rolling 24h). Waiting for the window to free a slot. ${parts.join('; ')}`
}

export function throwIfDailyLimitBlocked(check: DailyUploadLimitCheck): void {
  if (!check.blocked) return
  throw new ProjectApiError(ERROR_CODES.DAILY_UPLOAD_LIMIT_REACHED, dailyLimitDeferMessage(check), {
    stage: 'upload',
    retryable: true,
  })
}
