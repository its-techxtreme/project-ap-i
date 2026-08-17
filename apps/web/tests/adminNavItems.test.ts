import { describe, expect, it } from 'vitest'

import { ADMIN_NAV_ITEMS, isAdminNavActive } from '@/lib/admin/navItems'

describe('ADMIN_NAV_ITEMS', () => {
  it('includes Book and Charts destinations for mobile access', () => {
    const hrefs = ADMIN_NAV_ITEMS.map((item) => item.href)
    expect(hrefs).toContain('/admin/logs')
    expect(hrefs).toContain('/admin/settings')
    expect(hrefs).toContain('/admin/collector')
    expect(ADMIN_NAV_ITEMS.find((i) => i.href === '/admin/collector')?.shortLabel).toBe('Inbox')
    expect(ADMIN_NAV_ITEMS.find((i) => i.href === '/admin/logs')?.shortLabel).toBe('Book')
    expect(ADMIN_NAV_ITEMS.find((i) => i.href === '/admin/settings')?.shortLabel).toBe('Charts')
  })

  it('marks nested routes active without matching the overview root', () => {
    expect(isAdminNavActive('/admin', '/admin')).toBe(true)
    expect(isAdminNavActive('/admin/jobs', '/admin')).toBe(false)
    expect(isAdminNavActive('/admin/jobs/abc', '/admin/jobs')).toBe(true)
    expect(isAdminNavActive('/admin/settings', '/admin/settings')).toBe(true)
  })
})
