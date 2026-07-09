import { config } from '../config'
import { logger } from '../logging/logger'

import { detectLoginOrChallenge } from './loginChallengeDetection'
import { launchAuthenticatedContext } from './playwrightContext'
import { humanClick, humanIdleMotion, humanPause, humanReadingPause, humanScroll, humanSetFiles, humanType } from './playwrightHumanBehavior'
import { SessionHealthChecker } from './SessionHealthChecker'
import type { PlatformUploader, SessionHealth, UploadInput, UploadResult } from './types'

function isLoginRelatedError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('login') ||
    lower.includes('sign in') ||
    lower.includes('2fa') ||
    lower.includes('captcha') ||
    lower.includes('challenge')
  )
}

function loginRequiredResult(errorCode: string, errorMessage: string): UploadResult {
  return {
    success: false,
    errorCode,
    loginRequired: true,
    errorMessage,
  }
}

export class InstagramPlaywrightUploader implements PlatformUploader {
  private readonly sessionChecker = new SessionHealthChecker()

  async checkSession(accountId: string, profilePath?: string): Promise<SessionHealth> {
    return this.sessionChecker.checkSession(accountId, profilePath)
  }

  async upload(input: UploadInput): Promise<UploadResult> {
    if (!config.REAL_UPLOADS_ENABLED || !config.INSTAGRAM_UPLOADS_ENABLED) {
      return {
        success: false,
        errorCode: 'UPLOAD_FLAG_DISABLED',
        errorMessage:
          'Instagram uploads are disabled. Set REAL_UPLOADS_ENABLED and INSTAGRAM_UPLOADS_ENABLED to true.',
      }
    }

    const profilePath = input.account.browserProfilePath
    if (!profilePath) {
      return loginRequiredResult(
        'INSTAGRAM_LOGIN_REQUIRED',
        'No browser profile configured for this Instagram account.',
      )
    }

    if (!input.localFilePath) {
      return {
        success: false,
        errorCode: 'INSTAGRAM_UPLOAD_FAILED',
        errorMessage: 'No local file path provided for Instagram upload.',
      }
    }

    let context
    try {
      context = await launchAuthenticatedContext(profilePath)
      const page = await context.newPage()

      await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await humanReadingPause()
      await humanScroll(page)
      if (Math.random() > 0.4) {
        await humanIdleMotion(page)
      }

      const challenge = await detectLoginOrChallenge(page)
      if (challenge.loginRequired) {
        logger.warn({
          msg: 'Instagram login or challenge detected',
          jobId: input.jobId,
          account: input.account.accountLabel,
          challengeType: challenge.challengeType,
        })
        return loginRequiredResult(
          'INSTAGRAM_LOGIN_REQUIRED',
          challenge.reason ?? 'Instagram session requires login.',
        )
      }

      await page.goto('https://www.instagram.com/create/style/', {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      })
      await humanReadingPause()

      const fileInput = page.locator('input[type="file"]').first()
      await humanSetFiles(fileInput)
      await fileInput.setInputFiles(input.localFilePath)
      await humanReadingPause()

      const nextBtn = page
        .locator('button:has-text("Next"), div[role="button"]:has-text("Next")')
        .first()
      if (await nextBtn.isVisible({ timeout: 25_000 }).catch(() => false)) {
        await humanClick(page, nextBtn)
        await humanPause()
      }

      if (input.metadata.instagramCaption) {
        const captionField = page
          .locator('textarea[aria-label*="caption"], textarea[placeholder*="Write a caption"]')
          .first()
        if (await captionField.isVisible({ timeout: 12_000 }).catch(() => false)) {
          await humanType(captionField, input.metadata.instagramCaption, { clearFirst: true })
        }
      }

      await humanPause()

      const shareBtn = page
        .locator('button:has-text("Share"), div[role="button"]:has-text("Share")')
        .first()
      await humanClick(page, shareBtn)

      await humanReadingPause()

      const postChallenge = await detectLoginOrChallenge(page)
      if (postChallenge.loginRequired) {
        return loginRequiredResult(
          'INSTAGRAM_LOGIN_REQUIRED',
          postChallenge.reason ?? 'Instagram blocked publish — manual review required.',
        )
      }

      logger.info({
        msg: 'Instagram upload completed',
        jobId: input.jobId,
        account: input.account.accountLabel,
      })

      return {
        success: true,
        platformMediaId: `ig-${input.jobId}-${Date.now()}`,
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)

      if (isLoginRelatedError(msg)) {
        return loginRequiredResult('INSTAGRAM_LOGIN_REQUIRED', msg)
      }

      logger.error({ msg: 'Instagram upload failed', jobId: input.jobId, error: msg })
      return { success: false, errorCode: 'INSTAGRAM_UPLOAD_FAILED', errorMessage: msg }
    } finally {
      await context?.close()
    }
  }
}
