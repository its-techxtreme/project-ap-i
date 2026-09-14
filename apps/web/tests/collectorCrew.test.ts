import { describe, expect, it } from 'vitest'

import {
  collectorLoginRequired,
  collectorLoginFromHeartbeat,
  collectorProfileFromHeartbeat,
  parseCollectorLoginFlag,
} from '@/lib/admin/collectorCrew'

describe('collector crew helpers', () => {
  it('reads login and profile from the worker heartbeat blob', () => {
    const hb = {
      collector: { loginRequired: true, profile: 'ig-collector' },
    }
    expect(collectorLoginFromHeartbeat(hb)).toBe(true)
    expect(collectorProfileFromHeartbeat(hb)).toBe('ig-collector')
    expect(collectorLoginFromHeartbeat({ collector: { loginRequired: false } })).toBe(false)
  })

  it('parses system_settings flags', () => {
    expect(parseCollectorLoginFlag(true)).toBe(true)
    expect(parseCollectorLoginFlag('true')).toBe(true)
    expect(parseCollectorLoginFlag(false)).toBe(false)
    expect(parseCollectorLoginFlag(null)).toBe(false)
  })

  it('ignores a stale heartbeat once the setting is false', () => {
    const hb = { collector: { loginRequired: true, profile: 'ig-collector' } }
    expect(collectorLoginRequired(false, hb, true)).toBe(false)
    expect(collectorLoginRequired(undefined, hb, false)).toBe(true)
  })
})
