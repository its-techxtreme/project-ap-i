import { describe, expect, it } from 'vitest'

import { isCollectorBrowserProfile } from '../src/uploaders/collectorProfileGuard'

describe('isCollectorBrowserProfile', () => {
  it('matches the harvest folder name', () => {
    expect(isCollectorBrowserProfile('C:/playwright-profiles/ig-collector')).toBe(true)
    expect(isCollectorBrowserProfile('C:/playwright-profiles/memes-ig')).toBe(false)
  })
})
