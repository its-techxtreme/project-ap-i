import { describe, expect, it } from 'vitest'

import { collectorMayRun } from '../src/collector/collectorControl'

describe('collectorMayRun', () => {
  it('skips when settings could not be read', () => {
    expect(
      collectorMayRun({
        armed: true,
        daily: { day: '2026-09-12', runs: [] },
        unavailable: true,
      }),
    ).toEqual({ ok: false, reason: 'Collector settings could not be read' })
  })

  it('skips when the switch is off', () => {
    expect(
      collectorMayRun({
        armed: false,
        daily: { day: '2026-09-12', runs: [] },
      }),
    ).toEqual({ ok: false, reason: 'Collector switch is off' })
  })
})
