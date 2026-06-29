/** Inclusive end-of-day for HTML date inputs (YYYY-MM-DD), UTC. */
export function endOfDayIso(dateOnly: string): string {
  const [year, month, day] = dateOnly.split('-').map(Number)
  if (!year || !month || !day) return dateOnly
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999)).toISOString()
}

/** Allow partial UUID search — alphanumeric and hyphens only. */
export function sanitizePartialUuid(value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (!/^[0-9a-fA-F-]+$/.test(trimmed)) return undefined
  return trimmed
}

export function formatSettingValue(value: unknown): string {
  if (value === undefined || value === null) return 'Not configured'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
