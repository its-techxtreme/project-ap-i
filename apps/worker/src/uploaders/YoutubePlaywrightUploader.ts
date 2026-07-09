import { logger } from '../logging/logger'
import { config } from '../config'

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

export class YoutubePlaywrightUploader implements PlatformUploader {
  private readonly sessionChecker = new SessionHealthChecker()

  async checkSession(accountId: string, profilePath?: string): Promise<SessionHealth> {
    return this.sessionChecker.checkSession(accountId, profilePath)
  }

  async upload(input: UploadInput): Promise<UploadResult> {
    if (!config.REAL_UPLOADS_ENABLED || !config.YOUTUBE_UPLOADS_ENABLED) {
      return {
        success: false,
        errorCode: 'UPLOAD_FLAG_DISABLED',
        errorMessage:
          'YouTube uploads are disabled. Set REAL_UPLOADS_ENABLED and YOUTUBE_UPLOADS_ENABLED to true.',
      }
    }

    const profilePath = input.account.browserProfilePath
    if (!profilePath) {
      return loginRequiredResult(
        'YOUTUBE_LOGIN_REQUIRED',
        'No browser profile configured for this YouTube account.',
      )
    }

    if (!input.localFilePath) {
      return {
        success: false,
        errorCode: 'YOUTUBE_UPLOAD_FAILED',
        errorMessage: 'No local file path provided for YouTube upload.',
      }
    }

    let context
    try {
      context = await launchAuthenticatedContext(profilePath)
      const page = await context.newPage()

      // Warm up on main YouTube first — jumping straight to Studio looks bot-like.
      await page.goto('https://www.youtube.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await humanReadingPause()
      await humanScroll(page)
      if (Math.random() > 0.4) {
        await humanIdleMotion(page)
      }

      await page.goto('https://studio.youtube.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await humanReadingPause()

      const challenge = await detectLoginOrChallenge(page)
      if (challenge.loginRequired) {
        logger.warn({
          msg: 'YouTube login or challenge detected',
          jobId: input.jobId,
          account: input.account.accountLabel,
          challengeType: challenge.challengeType,
        })
        return loginRequiredResult('YOUTUBE_LOGIN_REQUIRED', challenge.reason ?? 'YouTube session requires login.')
      }

      const uploadBtn = page
        .locator('[aria-label="Upload video"], #upload-btn, [test-id="upload-btn"], ytd-topbar-menu-button-renderer')
        .first()
      await humanClick(page, uploadBtn)

      const fileInput = page.locator('input[type="file"]')
      await humanSetFiles(fileInput)
      await fileInput.setInputFiles(input.localFilePath)
      await humanReadingPause()

      await page
        .locator('#title-textarea, [placeholder*="title"], ytcp-social-suggestions-textbox')
        .first()
        .waitFor({ timeout: 120_000 })

      if (input.metadata.youtubeTitle) {
        const titleField = page.locator('#title-textarea textarea, [placeholder*="title"]').first()
        await humanType(titleField, input.metadata.youtubeTitle, { clearFirst: true })
      }

      if (input.metadata.youtubeDescription) {
        const descField = page
          .locator('#description-textarea textarea, [placeholder*="description"]')
          .first()
        await humanType(descField, input.metadata.youtubeDescription, { clearFirst: true })
      }

      await humanPause()

      for (let i = 0; i < 3; i++) {
        const nextBtn = page.locator('button:has-text("Next"), #next-button').first()
        if (await nextBtn.isVisible({ timeout: 8_000 }).catch(() => false)) {
          await humanClick(page, nextBtn)
          await humanPause()
          if (Math.random() > 0.45) {
            await humanScroll(page)
          }
          if (Math.random() > 0.55) {
            await humanIdleMotion(page)
          }
        }
      }

      const publicOption = page
        .locator('tp-yt-paper-radio-button[name="PUBLIC"], label:has-text("Public")')
        .first()
      if (await publicOption.isVisible({ timeout: 8_000 }).catch(() => false)) {
        await humanClick(page, publicOption)
        await humanPause(1500, 3500)
      }

      const publishBtn = page
        .locator('button:has-text("Publish"), button:has-text("Done"), #done-button')
        .first()
      await humanClick(page, publishBtn)

      await humanReadingPause()

      const postChallenge = await detectLoginOrChallenge(page)
      if (postChallenge.loginRequired) {
        return loginRequiredResult(
          'YOUTUBE_LOGIN_REQUIRED',
          postChallenge.reason ?? 'YouTube blocked publish — manual review required.',
        )
      }

      logger.info({
        msg: 'YouTube upload completed',
        jobId: input.jobId,
        account: input.account.accountLabel,
      })

      return {
        success: true,
        platformMediaId: `yt-${input.jobId}-${Date.now()}`,
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)

      if (isLoginRelatedError(msg)) {
        return loginRequiredResult('YOUTUBE_LOGIN_REQUIRED', msg)
      }

      logger.error({ msg: 'YouTube upload failed', jobId: input.jobId, error: msg })
      return { success: false, errorCode: 'YOUTUBE_UPLOAD_FAILED', errorMessage: msg }
    } finally {
      await context?.close()
    }
  }
}
