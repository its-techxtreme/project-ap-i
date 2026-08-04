import { describe, expect, it } from 'vitest'

import {
  REMOTE_LAPTOP_STALE_MS,
  parseRemoteLaptopStatus,
} from '@/lib/admin/remoteLaptopStatus'

describe('parseRemoteLaptopStatus', () => {
  const now = Date.parse('2026-08-01T00:00:00.000Z')

  it('reports offline when heartbeat is missing', () => {
    const status = parseRemoteLaptopStatus(null, now)
    expect(status.state).toBe('offline')
    expect(status.label).toBe('Remote laptop offline')
  })

  it('reports offline when heartbeat is stale', () => {
    const status = parseRemoteLaptopStatus(
      {
        at: new Date(now - REMOTE_LAPTOP_STALE_MS - 1).toISOString(),
        ok: true,
        host: 'Lenovo-LOQ',
        driveOk: true,
        realUploadsEnabled: true,
      },
      now,
    )
    expect(status.state).toBe('offline')
    expect(status.label).toBe('Remote laptop offline')
  })

  it('reports ready when heartbeat is fresh and healthy', () => {
    const status = parseRemoteLaptopStatus(
      {
        at: new Date(now - 5_000).toISOString(),
        ok: true,
        host: 'Lenovo-LOQ',
        driveOk: true,
        realUploadsEnabled: true,
      },
      now,
    )
    expect(status.state).toBe('ready')
    expect(status.label).toBe('Laptop connected — ready for work')
    expect(status.shortLabel).toBe('Laptop ready')
    expect(status.detail).toContain('uploads armed')
  })

  it('reports degraded when heartbeat is fresh but not ok', () => {
    const status = parseRemoteLaptopStatus(
      {
        at: new Date(now - 5_000).toISOString(),
        ok: false,
        host: 'Lenovo-LOQ',
        driveOk: false,
        realUploadsEnabled: true,
      },
      now,
    )
    expect(status.state).toBe('degraded')
    expect(status.label).toBe('Laptop connected — not ready')
    expect(status.shortLabel).toBe('Laptop not ready')
    expect(status.detail).toContain('Drive unhealthy')
  })
})
