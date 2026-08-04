import { describe, expect, it } from 'vitest'

import {
  endOfDayIso,
  formatSettingValue,
  sanitizePartialUuid,
} from '@/lib/format/dateFilters'

describe('dateFilters', () => {
  it('endOfDayIso includes the full calendar day in UTC', () => {
    expect(endOfDayIso('2026-06-29')).toBe('2026-06-29T23:59:59.999Z')
  })

  it('sanitizePartialUuid accepts partial UUID fragments', () => {
    expect(sanitizePartialUuid('debe4d61')).toBe('debe4d61')
    expect(sanitizePartialUuid('  debe4d61  ')).toBe('debe4d61')
  })

  it('sanitizePartialUuid rejects unsafe characters', () => {
    expect(sanitizePartialUuid('%')).toBeUndefined()
    expect(sanitizePartialUuid('job;drop')).toBeUndefined()
  })

  it('formatSettingValue renders primitives and objects', () => {
    expect(formatSettingValue(30)).toBe('30')
    expect(formatSettingValue({ enabled: true })).toBe('{"enabled":true}')
    expect(formatSettingValue(undefined)).toBe('Not configured')
  })

  it('formatSettingValue formats background music volume as percent', () => {
    expect(formatSettingValue(0.3, 'background_music_volume')).toBe('30% (0.3)')
    expect(formatSettingValue('0.05', 'background_music_volume')).toBe('5% (0.05)')
  })
})
