import { describe, expect, it } from 'vitest'

import { chromeLaunchArgs } from '../src/uploaders/chromeLaunchArgs'

describe('chromeLaunchArgs', () => {
  it('mutes Chromium audio for background tabs', () => {
    expect(chromeLaunchArgs()).toContain('--mute-audio')
    expect(chromeLaunchArgs()).toContain('--autoplay-policy=user-gesture-required')
  })
})
