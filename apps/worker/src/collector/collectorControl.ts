import { supabaseAdmin } from '../db/supabaseAdmin'
import { logger } from '../logging/logger'

import {
  COLLECTOR_MAX_RUNS_PER_DAY,
  collectorRunsRemaining,
  normalizeCollectorDailyRuns,
  parseSettingFlag,
  withCollectorRunRecorded,
  type CollectorDailyRuns,
} from './collectorDailyBudget'

export const COLLECTOR_ARMED_KEY = 'collector_armed'
export const COLLECTOR_DAILY_RUNS_KEY = 'collector_daily_runs'
export const COLLECTOR_LOGIN_KEY = 'collector_login_required'

export type CollectorControl = {
  armed: boolean
  daily: CollectorDailyRuns
  unavailable?: boolean
  loginRequired?: boolean
}

export async function pullCollectorControl(): Promise<CollectorControl> {
  const { data, error } = await supabaseAdmin
    .from('system_settings')
    .select('key, value')
    .in('key', [COLLECTOR_ARMED_KEY, COLLECTOR_DAILY_RUNS_KEY, COLLECTOR_LOGIN_KEY])

  if (error) {
    logger.warn({ msg: 'Collector control read failed', error: error.message })
    return { armed: true, daily: normalizeCollectorDailyRuns(null), unavailable: true, loginRequired: false }
  }

  const map = new Map((data ?? []).map((row) => [row.key, row.value]))
  return {
    armed: parseSettingFlag(map.get(COLLECTOR_ARMED_KEY), true),
    daily: normalizeCollectorDailyRuns(map.get(COLLECTOR_DAILY_RUNS_KEY)),
    loginRequired: parseSettingFlag(map.get(COLLECTOR_LOGIN_KEY), false),
  }
}

export async function markCollectorRunUsed(
  daily: CollectorDailyRuns,
): Promise<
  | { ok: true; daily: CollectorDailyRuns }
  | { ok: false; daily: CollectorDailyRuns; error: string }
> {
  const next = withCollectorRunRecorded(daily, new Date().toISOString())
  const { error } = await supabaseAdmin.from('system_settings').upsert(
    {
      key: COLLECTOR_DAILY_RUNS_KEY,
      value: next,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  )
  if (error) {
    logger.warn({ msg: 'Collector daily run persist failed', error: error.message })
    return { ok: false, daily, error: error.message }
  }
  return { ok: true, daily: next }
}

export async function persistCollectorLoginRequired(loginRequired: boolean): Promise<void> {
  const { error } = await supabaseAdmin.from('system_settings').upsert(
    {
      key: COLLECTOR_LOGIN_KEY,
      value: loginRequired,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  )
  if (error) {
    logger.warn({ msg: 'Collector login flag persist failed', error: error.message })
  }
}

export function collectorMayRun(control: CollectorControl): { ok: true } | { ok: false; reason: string } {
  if (control.unavailable) return { ok: false, reason: 'Collector settings could not be read' }
  if (control.loginRequired) return { ok: false, reason: 'Collector login required' }
  if (!control.armed) return { ok: false, reason: 'Collector switch is off' }
  if (collectorRunsRemaining(control.daily) <= 0) {
    return {
      ok: false,
      reason: `Collector already ran ${COLLECTOR_MAX_RUNS_PER_DAY} times today`,
    }
  }
  return { ok: true }
}
