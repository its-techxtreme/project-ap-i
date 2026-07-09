import { describe, expect, it, vi } from 'vitest'

import { randomInt } from '../src/uploaders/playwrightHumanBehavior'

vi.mock('../src/config', () => ({
  config: {
    PLAYWRIGHT_ACTION_DELAY_MIN_MS: 1,
    PLAYWRIGHT_ACTION_DELAY_MAX_MS: 2,
    PLAYWRIGHT_TYPING_DELAY_MIN_MS: 1,
    PLAYWRIGHT_TYPING_DELAY_MAX_MS: 2,
    PLAYWRIGHT_READING_DELAY_MIN_MS: 1,
    PLAYWRIGHT_READING_DELAY_MAX_MS: 2,
  },
}))

describe('playwrightHumanBehavior', () => {
  it('randomInt stays within bounds', () => {
    for (let i = 0; i < 50; i++) {
      const value = randomInt(10, 20)
      expect(value).toBeGreaterThanOrEqual(10)
      expect(value).toBeLessThanOrEqual(20)
    }
  })
})

describe('loginChallengeDetection', () => {
  it('detects login form', async () => {
    const isVisible = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)

    const page = {
      locator: vi.fn(() => ({
        first: () => ({
          isVisible,
        }),
        innerText: vi.fn().mockResolvedValue('Welcome back'),
      })),
    }

    const { detectLoginOrChallenge } = await import('../src/uploaders/loginChallengeDetection')
    const result = await detectLoginOrChallenge(page as never)

    expect(result.loginRequired).toBe(true)
    expect(result.challengeType).toBe('login_form')
  })

  it('detects captcha iframe without attempting bypass', async () => {
    const isVisible = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)

    const page = {
      locator: vi.fn(() => ({
        first: () => ({
          isVisible,
        }),
        innerText: vi.fn().mockResolvedValue(''),
      })),
    }

    const { detectLoginOrChallenge } = await import('../src/uploaders/loginChallengeDetection')
    const result = await detectLoginOrChallenge(page as never)

    expect(result.loginRequired).toBe(true)
    expect(result.challengeType).toBe('captcha')
    expect(result.reason).toContain('Manual login required')
  })

  it('detects unusual traffic text', async () => {
    const isVisible = vi.fn().mockResolvedValue(false)

    const page = {
      locator: vi.fn(() => ({
        first: () => ({
          isVisible,
        }),
        innerText: vi.fn().mockResolvedValue('Our systems have detected unusual traffic from your network.'),
      })),
    }

    const { detectLoginOrChallenge } = await import('../src/uploaders/loginChallengeDetection')
    const result = await detectLoginOrChallenge(page as never)

    expect(result.loginRequired).toBe(true)
    expect(result.challengeType).toBe('unusual_traffic')
  })

  it('returns healthy when no challenge present', async () => {
    const isVisible = vi.fn().mockResolvedValue(false)

    const page = {
      locator: vi.fn(() => ({
        first: () => ({
          isVisible,
        }),
        innerText: vi.fn().mockResolvedValue('YouTube Studio dashboard'),
      })),
    }

    const { detectLoginOrChallenge } = await import('../src/uploaders/loginChallengeDetection')
    const result = await detectLoginOrChallenge(page as never)

    expect(result.loginRequired).toBe(false)
  })
})
