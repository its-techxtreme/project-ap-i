/** How stale a worker heartbeat may be before the laptop is treated as offline. */
export const REMOTE_LAPTOP_STALE_MS = 75_000

export type RemoteLaptopState = 'offline' | 'ready' | 'degraded'

export type RemoteLaptopStatus = {
  state: RemoteLaptopState
  label: string
  detail: string
  lastSeenAt: string | null
  ok: boolean | null
}

type HeartbeatValue = {
  at?: unknown
  ok?: unknown
  host?: unknown
  driveOk?: unknown
  realUploadsEnabled?: unknown
}

export function parseRemoteLaptopStatus(
  value: unknown,
  nowMs: number = Date.now(),
): RemoteLaptopStatus {
  if (!value || typeof value !== 'object') {
    return {
      state: 'offline',
      label: 'Remote laptop offline',
      detail: 'No worker heartbeat yet',
      lastSeenAt: null,
      ok: null,
    }
  }

  const hb = value as HeartbeatValue
  const at = typeof hb.at === 'string' ? hb.at : null
  const seenMs = at ? Date.parse(at) : Number.NaN

  if (!at || !Number.isFinite(seenMs) || nowMs - seenMs > REMOTE_LAPTOP_STALE_MS) {
    return {
      state: 'offline',
      label: 'Remote laptop offline',
      detail: at ? `Last seen ${at}` : 'No worker heartbeat yet',
      lastSeenAt: at,
      ok: typeof hb.ok === 'boolean' ? hb.ok : null,
    }
  }

  const ok = hb.ok === true
  const host = typeof hb.host === 'string' && hb.host.trim() ? hb.host.trim() : 'laptop'
  const driveOk = hb.driveOk !== false
  const uploads = hb.realUploadsEnabled === true

  if (ok && driveOk) {
    return {
      state: 'ready',
      label: 'Laptop connected — ready for work',
      detail: uploads ? `${host} · uploads armed` : `${host} · dry-run`,
      lastSeenAt: at,
      ok: true,
    }
  }

  return {
    state: 'degraded',
    label: 'Laptop connected — not ready',
    detail: !driveOk ? `${host} · Drive unhealthy` : `${host} · health degraded`,
    lastSeenAt: at,
    ok: false,
  }
}
