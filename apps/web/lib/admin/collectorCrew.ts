export const COLLECTOR_CREW_ACCOUNT_ID = 'collector-ig'
export const COLLECTOR_LOGIN_SETTING_KEY = 'collector_login_required'
export const COLLECTOR_ARMED_KEY = 'collector_armed'

export function parseCollectorLoginFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (value === 'true' || value === 1 || value === '1') return true
  if (value && typeof value === 'object' && 'loginRequired' in value) {
    return parseCollectorLoginFlag((value as { loginRequired: unknown }).loginRequired)
  }
  return false
}

export function collectorProfileFromHeartbeat(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const collector = (value as { collector?: unknown }).collector
  if (!collector || typeof collector !== 'object') return null
  const profile = (collector as { profile?: unknown }).profile
  return typeof profile === 'string' && profile.trim() ? profile.trim() : null
}

export function collectorLoginFromHeartbeat(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const collector = (value as { collector?: unknown }).collector
  if (!collector || typeof collector !== 'object') return false
  return (collector as { loginRequired?: unknown }).loginRequired === true
}
