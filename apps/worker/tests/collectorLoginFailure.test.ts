import { describe, expect, it } from 'vitest'

import { isCollectorLoginFailure } from '../src/collector/collectorLoginFailure'

describe('isCollectorLoginFailure', () => {
  it('treats real login and checkpoint copy as login required', () => {
    expect(isCollectorLoginFailure('login_required')).toBe(true)
    expect(isCollectorLoginFailure('https://www.instagram.com/accounts/login/')).toBe(true)
    expect(isCollectorLoginFailure('checkpoint required')).toBe(true)
    expect(isCollectorLoginFailure('enter the code we sent')).toBe(true)
  })

  it('does not treat search shortfalls or profile paths as login', () => {
    expect(
      isCollectorLoginFailure(
        'Collector search failed for sports (query "sport"): needed 3 unique reels, got 1. Page: https://www.instagram.com/explore/search/keyword/?q=sport',
      ),
    ).toBe(false)
    expect(
      isCollectorLoginFailure(
        'browserType.launchPersistentContext: ... playwright-profiles\\ig-collector',
      ),
    ).toBe(false)
  })
})
