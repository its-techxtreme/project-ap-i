export const COLLECTOR_MAX_RUNS_PER_DAY = 2

export function parseSettingFlag(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  if (value === 'true' || value === 1 || value === '1') return true
  if (value === 'false' || value === 0 || value === '0') return false
  return fallback
}

export type CollectorDailyRuns = {
  day: string
  runs: string[]
}

export function localDayKey(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function normalizeCollectorDailyRuns(value: unknown, now = new Date()): CollectorDailyRuns {
  const day = localDayKey(now)
  if (!value || typeof value !== 'object') return { day, runs: [] }
  const rec = value as { day?: unknown; runs?: unknown }
  if (rec.day !== day) return { day, runs: [] }
  const runs = Array.isArray(rec.runs)
    ? rec.runs.filter((item): item is string => typeof item === 'string')
    : []
  return { day, runs }
}

export function collectorRunsRemaining(
  state: CollectorDailyRuns,
  max = COLLECTOR_MAX_RUNS_PER_DAY,
): number {
  return Math.max(0, max - state.runs.length)
}

export function withCollectorRunRecorded(
  state: CollectorDailyRuns,
  atIso: string,
  max = COLLECTOR_MAX_RUNS_PER_DAY,
): CollectorDailyRuns {
  if (state.runs.length >= max) return state
  return { day: state.day, runs: [...state.runs, atIso] }
}
