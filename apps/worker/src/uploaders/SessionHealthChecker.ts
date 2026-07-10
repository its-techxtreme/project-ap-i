import fs from 'fs/promises'

import { logger } from '../logging/logger'

import { withAuthenticatedContext } from './playwrightContext'
import type { SessionHealth } from './types'

export class SessionHealthChecker {
  async checkSession(accountId: string, profilePath?: string): Promise<SessionHealth> {
    if (!profilePath) {
      logger.warn({ msg: 'No browser profile path configured', accountId })
      return { healthy: false, reason: 'No browser profile path configured', loginRequired: true }
    }

    try {
      await fs.access(profilePath)
    } catch {
      logger.warn({ msg: 'Browser profile directory not found', accountId, profilePath })
      return { healthy: false, reason: 'Browser profile directory not found', loginRequired: true }
    }

    try {
      return await withAuthenticatedContext(profilePath, async (browser) => {
        const pages = browser.pages()
        return { healthy: pages.length >= 0 }
      })
    } catch (err) {
      logger.warn({ msg: 'Browser profile failed to load', accountId, err: String(err) })
      return { healthy: false, reason: 'Profile failed to load', loginRequired: true }
    }
  }
}
