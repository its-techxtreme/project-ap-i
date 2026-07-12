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

/** Soft Google/YouTube security upsells — NOT a blocked session. */
const SOFT_SECURITY_PROMO_PATTERNS = [
  /turn on 2-?step verification/i,
  /turn on two-?step verification/i,
  /protect your account with 2-?step/i,
  /protect your account with two-?step/i,
  /make your account (more )?secure/i,
  /get started with 2-?step/i,
  /enable 2-?step verification/i,
  /add an extra layer of security/i,
  /keep your account safe/i,
  /tips? to protect your account/i,
  /we recommend .*2-?step/i,
  // Studio top banner while fully logged in (Dismiss / Get started)
  /at greater risk of attack/i,
  /don'?t have two-?step verification/i,
  /don'?t have 2-?step verification/i,
  /turn it on now for extra security/i,
]

/**
 * Phrases that indicate a real blocking interstitial (must continue / enter a code).
 * Avoid bare "2-step verification" — that appears in notifications while logged in.
 */
const HARD_CHALLENGE_TEXT_PATTERNS: Array<{ pattern: RegExp; challengeType: ChallengeType }> = [
  {
    pattern: /our systems have detected unusual traffic/i,
    challengeType: 'unusual_traffic',
  },
  {
    pattern: /verify it'?s you to continue/i,
    challengeType: 'verify_identity',
  },
  {
    pattern: /to continue[, ]+(please )?verify it'?s you/i,
    challengeType: 'verify_identity',
  },
  {
    pattern: /confirm it'?s you to continue/i,
    challengeType: 'verify_identity',
  },
  {
    pattern: /confirm your identity to continue/i,
    challengeType: 'verify_identity',
  },
  {
    pattern: /enter the code (we sent|from your|shown on)/i,
    challengeType: '2fa',
  },
  {
    pattern: /get a verification code at/i,
    challengeType: '2fa',
  },
  {
    pattern: /choose how you want to sign in to continue/i,
    challengeType: 'login_form',
  },
  {
    pattern: /couldn'?t sign you in/i,
    challengeType: 'login_form',
  },
  {
    pattern: /sign in to continue to youtube/i,
    challengeType: 'login_form',
  },
]

function isAuthChallengeUrl(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    const path = `${u.pathname}${u.search}`.toLowerCase()
    if (host.includes('accounts.google.com')) {
      return /signin|challenge|identifier|servicelogin|v3\/signin|accountchooser/.test(path)
    }
    if (host.includes('youtube.com')) {
      return /\/signin|accounts\/|\/login/.test(path)
    }
    return false
  } catch {
    return false
  }
}

function looksLikeSoftSecurityPromo(bodyText: string): boolean {
  return SOFT_SECURITY_PROMO_PATTERNS.some((p) => p.test(bodyText))
}

/**
 * Detect login pages, CAPTCHA, or blocking identity challenges.
 * Never attempts to bypass — caller must mark login_required and stop.
 *
 * Intentionally ignores YouTube/Google "turn on 2FA" notifications and account
 * security upsells that appear while the session is still valid.
 */
export async function detectLoginOrChallenge(page: Page): Promise<ChallengeDetectionResult> {
  const url = typeof page.url === 'function' ? page.url() : ''

  // Prefer Studio readiness first. Notifications / account menus can include email
  // inputs or "Verify it's you" / "2-Step Verification" copy while still logged in.
  const studioReady = await page
    .locator('#create-icon, ytcp-button#create-icon, [aria-label="Create"], button[aria-label*="Create"]')
    .first()
    .isVisible({ timeout: 1_500 })
    .catch(() => false)

  if (studioReady && !isAuthChallengeUrl(url)) {
    return { loginRequired: false }
  }

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

  if (looksLikeSoftSecurityPromo(bodyText) && !isAuthChallengeUrl(url)) {
    // Upsell / notification copy only — keep going unless we're on an auth URL.
    const hardWhilePromo = HARD_CHALLENGE_TEXT_PATTERNS.find(({ pattern }) => pattern.test(bodyText))
    if (!hardWhilePromo) {
      return { loginRequired: false }
    }
  }

  if (isAuthChallengeUrl(url)) {
    return {
      loginRequired: true,
      challengeType: 'login_form',
      reason: `Auth challenge URL detected (${url}). Manual login required.`,
    }
  }

  for (const { pattern, challengeType } of HARD_CHALLENGE_TEXT_PATTERNS) {
    if (pattern.test(bodyText)) {
      return {
        loginRequired: true,
        challengeType,
        reason: `Platform challenge detected (${challengeType}). Manual intervention required.`,
      }
    }
  }

  return { loginRequired: false }
}
