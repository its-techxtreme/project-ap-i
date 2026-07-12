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
      // studio create
      .mockResolvedValueOnce(false)
      // login form
      .mockResolvedValueOnce(true)

    const page = {
      url: () => 'https://accounts.google.com/v3/signin/identifier',
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
      // studio create
      .mockResolvedValueOnce(false)
      // login form
      .mockResolvedValueOnce(false)
      // captcha
      .mockResolvedValueOnce(true)

    const page = {
      url: () => 'https://studio.youtube.com/',
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
      url: () => 'https://www.google.com/sorry/index',
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

  it('ignores YouTube 2FA security upsell while Studio create is available', async () => {
    const isVisible = vi
      .fn()
      // studio create first
      .mockResolvedValueOnce(true)

    const page = {
      url: () => 'https://studio.youtube.com/',
      locator: vi.fn(() => ({
        first: () => ({ isVisible }),
        innerText: vi
          .fn()
          .mockResolvedValue(
            'Turn on 2-Step Verification to protect your account. Make your account more secure. Verify it\'s you.',
          ),
      })),
    }

    const { detectLoginOrChallenge } = await import('../src/uploaders/loginChallengeDetection')
    const result = await detectLoginOrChallenge(page as never)

    expect(result.loginRequired).toBe(false)
  })

  it('ignores bare 2-step promo text on Studio without create button', async () => {
    const isVisible = vi.fn().mockResolvedValue(false)

    const page = {
      url: () => 'https://studio.youtube.com/',
      locator: vi.fn(() => ({
        first: () => ({
          isVisible,
        }),
        innerText: vi
          .fn()
          .mockResolvedValue('Tip: Turn on 2-Step Verification. Protect your account with 2-Step Verification.'),
      })),
    }

    const { detectLoginOrChallenge } = await import('../src/uploaders/loginChallengeDetection')
    const result = await detectLoginOrChallenge(page as never)

    expect(result.loginRequired).toBe(false)
  })

  it('still flags verify-its-you-to-continue interstitials', async () => {
    const isVisible = vi.fn().mockResolvedValue(false)

    const page = {
      url: () => 'https://studio.youtube.com/',
      locator: vi.fn(() => ({
        first: () => ({
          isVisible,
        }),
        innerText: vi.fn().mockResolvedValue('Verify it\'s you to continue to YouTube Studio'),
      })),
    }

    const { detectLoginOrChallenge } = await import('../src/uploaders/loginChallengeDetection')
    const result = await detectLoginOrChallenge(page as never)

    expect(result.loginRequired).toBe(true)
    expect(result.challengeType).toBe('verify_identity')
  })

  it('returns healthy when no challenge present', async () => {
    const isVisible = vi.fn().mockResolvedValue(false)

    const page = {
      url: () => 'https://studio.youtube.com/',
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

  it('ignores Studio 2FA risk banner copy while logged in', async () => {
    const isVisible = vi.fn().mockResolvedValue(false)

    const page = {
      url: () => 'https://studio.youtube.com/',
      locator: vi.fn(() => ({
        first: () => ({
          isVisible,
        }),
        innerText: vi
          .fn()
          .mockResolvedValue(
            "Your account is at greater risk of attack because you don't have two-step verification. Turn it on now for extra security Get started Dismiss",
          ),
      })),
    }

    const { detectLoginOrChallenge } = await import('../src/uploaders/loginChallengeDetection')
    const result = await detectLoginOrChallenge(page as never)

    expect(result.loginRequired).toBe(false)
  })
})
