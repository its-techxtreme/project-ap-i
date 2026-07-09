import type { Page } from 'playwright'

export type ChallengeType =
  | 'login_form'
  | 'captcha'
  | '2fa'
  | 'verify_identity'
  | 'unusual_traffic'

export interface ChallengeDetectionResult {
  loginRequired: boolean
  reason?: string
  challengeType?: ChallengeType
}

const CHALLENGE_TEXT_PATTERNS = [
  /verify it'?s you/i,
  /unusual traffic/i,
  /confirm your identity/i,
  /2-step verification/i,
  /two-step verification/i,
  /enter the code/i,
  /security check/i,
  /suspicious activity/i,
]

/**
 * Detect login pages, CAPTCHA, 2FA, or identity challenges.
 * Never attempts to bypass — caller must mark login_required and stop.
 */
export async function detectLoginOrChallenge(page: Page): Promise<ChallengeDetectionResult> {
  const loginFormVisible = await page
    .locator(
      'input[type="email"], input[name="username"], input[type="password"], input[name="Passwd"]',
    )
    .first()
    .isVisible({ timeout: 2_000 })
    .catch(() => false)

  if (loginFormVisible) {
    return {
      loginRequired: true,
      challengeType: 'login_form',
      reason: 'Login form detected — session expired or not authenticated.',
    }
  }

  const captchaVisible = await page
    .locator(
      'iframe[src*="recaptcha"], iframe[title*="recaptcha"], iframe[src*="captcha"], #captcha',
    )
    .first()
    .isVisible({ timeout: 1_500 })
    .catch(() => false)

  if (captchaVisible) {
    return {
      loginRequired: true,
      challengeType: 'captcha',
      reason: 'CAPTCHA challenge detected. Manual login required — automation cannot proceed.',
    }
  }

  const bodyText = await page.locator('body').innerText({ timeout: 3_000 }).catch(() => '')

  for (const pattern of CHALLENGE_TEXT_PATTERNS) {
    if (pattern.test(bodyText)) {
      const challengeType: ChallengeType = pattern.source.includes('2-step')
        ? '2fa'
        : pattern.source.includes('unusual')
          ? 'unusual_traffic'
          : 'verify_identity'

      return {
        loginRequired: true,
        challengeType,
        reason: `Platform challenge detected (${challengeType}). Manual intervention required.`,
      }
    }
  }

  return { loginRequired: false }
}
