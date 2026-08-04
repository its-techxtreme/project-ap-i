import { describe, expect, it } from 'vitest'

import { defaultThemeForSurface, THEME_STORAGE_KEYS, themeInitScript } from '@/lib/theme/themeInit'

describe('themeInit', () => {
  it('defaults both public and admin surfaces to light (day voyage)', () => {
    expect(defaultThemeForSurface('public')).toBe('light')
    expect(defaultThemeForSurface('admin')).toBe('light')
  })

  it('emits an inline script that falls back to the surface default', () => {
    const script = themeInitScript('admin')
    expect(script).toContain(THEME_STORAGE_KEYS.admin)
    expect(script).toContain('"light"')
    expect(script).toContain('dataset.surface="admin"')
  })
})
