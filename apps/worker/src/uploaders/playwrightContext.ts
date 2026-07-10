import fs from 'node:fs/promises'
import path from 'node:path'

import { chromium, type BrowserContext } from 'playwright'

import { config } from '../config'
import { logger } from '../logging/logger'

import {
  isPlaywrightProfileBusyError,
  withPlaywrightProfileLock,
} from './playwrightProfileLock'

/** Remove stale Chrome singleton locks left after crash/kill so relaunch can proceed. */
async function clearStaleChromeSingletonLocks(profilePath: string): Promise<void> {
  for (const name of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    try {
      await fs.unlink(path.join(profilePath, name))
      logger.warn({ msg: 'Removed stale Chrome profile lock file', profilePath, name })
    } catch {
      // absent is fine
    }
  }
}

async function launchPersistentContextRaw(
  profilePath: string,
  overrides?: { headless?: boolean },
): Promise<BrowserContext> {
  const channel = config.PLAYWRIGHT_CHANNEL?.trim().toLowerCase()

  if (config.REAL_UPLOADS_ENABLED) {
    if (channel !== 'chrome') {
      throw new Error(
        'REAL_UPLOADS_ENABLED requires PLAYWRIGHT_CHANNEL=chrome (installed Google Chrome). ' +
          `Got "${config.PLAYWRIGHT_CHANNEL ?? 'unset'}".`,
      )
    }
  }

  await clearStaleChromeSingletonLocks(profilePath)

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

  if (config.PLAYWRIGHT_CHROME_PATH?.trim()) {
    launchOptions.executablePath = config.PLAYWRIGHT_CHROME_PATH.trim()
  }

  try {
    return await chromium.launchPersistentContext(profilePath, launchOptions)
  } catch (err) {
    if (isPlaywrightProfileBusyError(err)) {
      // One more cleanup pass then single retry — common after hard kills.
      await clearStaleChromeSingletonLocks(profilePath)
      try {
        return await chromium.launchPersistentContext(profilePath, launchOptions)
      } catch (retryErr) {
        const busy = new Error(
          `PROFILE_BUSY: Chrome profile already in use (${profilePath}). ` +
            (retryErr instanceof Error ? retryErr.message : String(retryErr)),
        )
        busy.name = 'ProfileBusyError'
        throw busy
      }
    }
    throw err
  }
}

/**
 * Run work inside a locked persistent Chrome profile.
 * The profile lock is held for the entire session (launch → work → close)
 * so concurrent jobs cannot collide on the same user-data-dir.
 */
export async function withAuthenticatedContext<T>(
  profilePath: string,
  fn: (context: BrowserContext) => Promise<T>,
  overrides?: { headless?: boolean },
): Promise<T> {
  return withPlaywrightProfileLock(profilePath, async () => {
    const context = await launchPersistentContextRaw(profilePath, overrides)
    try {
      return await fn(context)
    } finally {
      await context.close().catch(() => undefined)
    }
  })
}

/**
 * @deprecated Prefer withAuthenticatedContext so the profile lock covers the full session.
 * Kept for callers that manage close themselves — still serializes launch only.
 */
export async function launchAuthenticatedContext(
  profilePath: string,
  overrides?: { headless?: boolean },
): Promise<BrowserContext> {
  return withPlaywrightProfileLock(profilePath, () =>
    launchPersistentContextRaw(profilePath, overrides),
  )
}
