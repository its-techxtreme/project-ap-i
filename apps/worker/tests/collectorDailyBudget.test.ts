import { describe, expect, it } from 'vitest'

import {
  COLLECTOR_MAX_RUNS_PER_DAY,
  collectorRunsRemaining,
  localDayKey,
  normalizeCollectorDailyRuns,
  parseSettingFlag,
  withCollectorRunRecorded,
} from '../src/collector/collectorDailyBudget'

describe('collector daily budget', () => {
  it('allows two runs on the same local day and then stops', () => {
    expect(COLLECTOR_MAX_RUNS_PER_DAY).toBe(2)
    const now = new Date(2026, 8, 10, 8, 0, 0)
    let state = normalizeCollectorDailyRuns(null, now)
    expect(state.day).toBe(localDayKey(now))
    expect(collectorRunsRemaining(state)).toBe(2)

    state = withCollectorRunRecorded(state, now.toISOString())
    expect(collectorRunsRemaining(state)).toBe(1)
    state = withCollectorRunRecorded(state, new Date(2026, 8, 10, 11, 0, 0).toISOString())
    expect(collectorRunsRemaining(state)).toBe(0)
    const blocked = withCollectorRunRecorded(state, new Date(2026, 8, 10, 14, 0, 0).toISOString())
    expect(blocked.runs).toHaveLength(2)
  })

  it('resets after local midnight', () => {
    const morning = new Date(2026, 8, 10, 22, 0, 0)
    const used = withCollectorRunRecorded(
      withCollectorRunRecorded(normalizeCollectorDailyRuns(null, morning), 'a'),
      'b',
    )
    const nextDay = normalizeCollectorDailyRuns(used, new Date(2026, 8, 11, 8, 0, 0))
    expect(collectorRunsRemaining(nextDay)).toBe(2)
  })

  it('parses jsonb and string flags', () => {
    expect(parseSettingFlag(true, false)).toBe(true)
    expect(parseSettingFlag('true', false)).toBe(true)
    expect(parseSettingFlag(1, false)).toBe(true)
    expect(parseSettingFlag('1', false)).toBe(true)
    expect(parseSettingFlag(false, true)).toBe(false)
    expect(parseSettingFlag('false', true)).toBe(false)
    expect(parseSettingFlag(0, true)).toBe(false)
    expect(parseSettingFlag('0', true)).toBe(false)
    expect(parseSettingFlag(null, true)).toBe(true)
  })
})
