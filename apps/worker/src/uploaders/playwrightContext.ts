import { chromium, type BrowserContext } from 'playwright'

import { config } from '../config'

/**
 * Launch a persistent browser profile with human-paced, headed defaults.
 * Set PLAYWRIGHT_CHANNEL=chrome so uploads reuse the same profile as manual Chrome login.
 * Does NOT use stealth evasion plugins — timing + persistent profiles only.
 */
export async function launchAuthenticatedContext(
  profilePath: string,
  overrides?: { headless?: boolean },
): Promise<BrowserContext> {
  const channel = config.PLAYWRIGHT_CHANNEL?.trim()
  const launchOptions: Parameters<typeof chromium.launchPersistentContext>[1] = {
    headless: overrides?.headless ?? config.PLAYWRIGHT_HEADLESS,
    slowMo: config.PLAYWRIGHT_SLOW_MO_MS,
    timeout: 90_000,
    locale: 'en-US',
    timezoneId: 'America/New_York',
    viewport: null,
    args: ['--no-first-run', '--no-default-browser-check'],
  }

  if (channel) {
    launchOptions.channel = channel
  }

  return chromium.launchPersistentContext(profilePath, launchOptions)
}
