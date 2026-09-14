import fs from 'node:fs/promises'
import path from 'node:path'

import { chromium, type BrowserContext, type Page } from 'playwright'

import { config } from '../config'
import { logger } from '../logging/logger'

import {
  isPlaywrightProfileBusyError,
  withPlaywrightProfileLock,
} from './playwrightProfileLock'
import { chromeLaunchArgs } from './chromeLaunchArgs'

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

async function muteContextAudio(context: BrowserContext): Promise<void> {
  await context.addInitScript(`(() => {
    const silence = (el) => {
      try {
        el.muted = true
        el.volume = 0
      } catch (e) {}
    }
    const proto = HTMLMediaElement.prototype
    const origPlay = proto.play
    proto.play = function () {
      silence(this)
      return origPlay.apply(this, arguments)
    }
  })()`)
  const mutePage = async (page: Page) => {
    try {
      const session = await context.newCDPSession(page)
      await (
        session as { send: (method: string, params: { muted: boolean }) => Promise<unknown> }
      ).send('Page.setAudioMuted', { muted: true })
    } catch {
      // Launch still includes --mute-audio.
    }
  }
  for (const page of context.pages()) {
    await mutePage(page)
  }
  context.on('page', (page) => {
    void mutePage(page)
  })
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
    args: chromeLaunchArgs(),
    // Drops Chrome's "unsupported command-line flag: --enable-automation" banner.
    ignoreDefaultArgs: ['--enable-automation'],
  }

  if (channel) {
    launchOptions.channel = channel
  }

  if (config.PLAYWRIGHT_CHROME_PATH?.trim()) {
    launchOptions.executablePath = config.PLAYWRIGHT_CHROME_PATH.trim()
  }

  try {
    const context = await chromium.launchPersistentContext(profilePath, launchOptions)
    await muteContextAudio(context)
    return context
  } catch (err) {
    if (isPlaywrightProfileBusyError(err)) {
      // One more cleanup pass then single retry — common after hard kills.
      await clearStaleChromeSingletonLocks(profilePath)
      try {
        const context = await chromium.launchPersistentContext(profilePath, launchOptions)
        await muteContextAudio(context)
        return context
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

/** Locked Chrome profile for the whole launch → work → close so two jobs dont share a user-data-dir. */
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

/** Old helper. Prefer withAuthenticatedContext so the lock lasts the whole session. This one only serializes launch. */
export async function launchAuthenticatedContext(
  profilePath: string,
  overrides?: { headless?: boolean },
): Promise<BrowserContext> {
  return withPlaywrightProfileLock(profilePath, () =>
    launchPersistentContextRaw(profilePath, overrides),
  )
}
