import fs from 'node:fs/promises'
import path from 'node:path'

import { logger } from '../logging/logger'
import { config } from '../config'

import { detectLoginOrChallenge } from './loginChallengeDetection'
import { launchAuthenticatedContext } from './playwrightContext'
import {
  clickFirstVisible,
  firstAttached,
  humanIdleMotion,
  humanPause,
  humanReadingPause,
  humanScroll,
  humanSetFiles,
  humanType,
} from './playwrightHumanBehavior'
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

async function saveDebugScreenshot(page: import('playwright').Page, jobId: string, label: string): Promise<void> {
  try {
    const dir = path.join(config.TMP_DIR, 'playwright-smoke')
    await fs.mkdir(dir, { recursive: true })
    const file = path.join(dir, `yt-${jobId.slice(0, 8)}-${label}-${Date.now()}.png`)
    await page.screenshot({ path: file, fullPage: true })
    logger.warn({ msg: 'YouTube upload debug screenshot saved', jobId, file })
  } catch {
    // best-effort
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

      await page.goto('https://www.youtube.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await humanReadingPause()
      await humanScroll(page)
      if (Math.random() > 0.5) await humanIdleMotion(page)

      await page.goto('https://studio.youtube.com/', { waitUntil: 'domcontentloaded', timeout: 90_000 })
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

      // Open upload dialog from Studio create control, then fall back to /upload.
      const openedCreate = await clickFirstVisible(
        page,
        [
          '#create-icon',
          'ytcp-button#create-icon',
          '[aria-label="Create"]',
          'button[aria-label*="Create"]',
          '#upload-icon',
        ],
        15_000,
      )

      if (openedCreate) {
        await clickFirstVisible(
          page,
          [
            'tp-yt-paper-item:has-text("Upload videos")',
            'tp-yt-paper-item:has-text("Upload video")',
            'yt-list-item-renderer:has-text("Upload")',
            'text=Upload videos',
            'text=Upload video',
          ],
          10_000,
        )
      } else {
        await page.goto('https://www.youtube.com/upload', {
          waitUntil: 'domcontentloaded',
          timeout: 60_000,
        })
        await humanReadingPause()
      }

      const fileInput = page.locator('input[type="file"]').first()
      await fileInput.waitFor({ state: 'attached', timeout: 45_000 })
      await humanSetFiles(fileInput)
      await fileInput.setInputFiles(input.localFilePath)

      // Details dialog can take a while after file select / processing starts.
      const titleField = await firstAttached(
        page,
        [
          '#title-textarea #textbox',
          'ytcp-social-suggestions-textbox#title-textarea #textbox',
          '#title-textarea textarea',
          'div#textbox[contenteditable="true"][aria-label*="title" i]',
          'div#textbox[contenteditable="true"][aria-label*="Title"]',
          '[aria-label*="Add a title" i]',
          'ytcp-video-title #textbox',
        ],
        180_000,
      )

      const title =
        input.metadata.youtubeTitle?.trim() ||
        `Short update #shorts`
      await humanType(titleField, title.substring(0, 100), { clearFirst: true })
      // Dismiss hashtag / social suggestion dropdowns that block the form.
      await page.keyboard.press('Escape').catch(() => undefined)
      await humanPause(400, 900)

      if (input.metadata.youtubeDescription?.trim()) {
        // Expand description if collapsed.
        await clickFirstVisible(
          page,
          [
            '#description-textarea #textbox',
            'ytcp-video-description #textbox',
            'text=Add description',
            '[aria-label*="description" i]',
          ],
          8_000,
        ).catch(() => false)

        const descField = await firstAttached(
          page,
          [
            '#description-textarea #textbox',
            'ytcp-social-suggestions-textbox#description-textarea #textbox',
            '#description-textarea textarea',
            'ytcp-video-description #textbox',
            'div#textbox[contenteditable="true"][aria-label*="description" i]',
            '[aria-label*="Tell viewers about your video" i]',
          ],
          30_000,
        ).catch(() => null)

        if (descField) {
          await humanType(descField, input.metadata.youtubeDescription.substring(0, 5000), {
            clearFirst: true,
          })
          await page.keyboard.press('Escape').catch(() => undefined)
        }
      }

      // Required: Made for Kids — Next stays disabled until answered.
      await page.keyboard.press('Escape').catch(() => undefined)
      const kidsAnswered = await clickFirstVisible(
        page,
        [
          'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
          '#audience tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
          'tp-yt-paper-radio-button:has-text("No, it\'s not made for kids")',
          'tp-yt-paper-radio-button:has-text("No, it\'s not")',
          'ytcp-radio-button:has-text("No, it\'s not made for kids")',
          'text=No, it\'s not made for kids',
        ],
        20_000,
      )
      if (!kidsAnswered) {
        await saveDebugScreenshot(page, input.jobId, 'kids-missing')
        throw new Error('YouTube Made for Kids audience question not answered')
      }
      await humanPause(800, 1600)

      // Dismiss AI-use / policy toast if present (blocks Next in newer Studio).
      await clickFirstVisible(
        page,
        [
          'ytcp-ve button:has-text("Close")',
          'tp-yt-paper-dialog button:has-text("Close")',
          'button:has-text("Close")',
          '[aria-label="Close"]',
        ],
        5_000,
      ).catch(() => false)
      await page.keyboard.press('Escape').catch(() => undefined)

      await humanPause()

      // Details → Video elements → Checks → Visibility (up to 4 Next clicks)
      for (let i = 0; i < 4; i++) {
        const nextEnabled = page.locator('#next-button:not([disabled]), ytcp-button#next-button:not([aria-disabled="true"])').first()
        const ready = await nextEnabled.isVisible({ timeout: 20_000 }).catch(() => false)
        if (!ready) {
          // Still blocked — try kids + close again once.
          await clickFirstVisible(
            page,
            [
              'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
              'text=No, it\'s not made for kids',
            ],
            3_000,
          ).catch(() => false)
          await clickFirstVisible(page, ['button:has-text("Close")'], 2_000).catch(() => false)
        }

        const clicked = await clickFirstVisible(
          page,
          [
            '#next-button:not([disabled])',
            'ytcp-button#next-button:not([disabled])',
            'ytcp-button#next-button:not([aria-disabled="true"])',
            'button:has-text("Next"):not([disabled])',
            '#next-button',
          ],
          15_000,
        )
        if (!clicked) break
        await humanPause()
        if (Math.random() > 0.5) await humanScroll(page)
      }

      await clickFirstVisible(
        page,
        [
          'tp-yt-paper-radio-button[name="PUBLIC"]',
          '#privacy-radios tp-yt-paper-radio-button[name="PUBLIC"]',
          'tp-yt-paper-radio-button:has-text("Public")',
          'label:has-text("Public")',
          'text=Public',
        ],
        20_000,
      )

      await humanPause(1500, 3000)

      const published = await clickFirstVisible(
        page,
        [
          '#done-button:not([disabled])',
          'ytcp-button#done-button:not([disabled])',
          'ytcp-button#done-button',
          'button:has-text("Publish")',
          'ytcp-button:has-text("Publish")',
          'button:has-text("Done")',
          '#done-button',
        ],
        45_000,
      )

      if (!published) {
        await saveDebugScreenshot(page, input.jobId, 'publish-missing')
        throw new Error('YouTube publish/done button not found')
      }

      await humanReadingPause()

      // Optional: capture share URL if dialog shows it
      let platformUrl: string | undefined
      const link = page.locator('a[href*="youtu.be/"], a[href*="youtube.com/watch"], a[href*="youtube.com/shorts/"]').first()
      if (await link.isVisible({ timeout: 15_000 }).catch(() => false)) {
        platformUrl = (await link.getAttribute('href')) ?? undefined
      }

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
        platformUrl,
      })

      return {
        success: true,
        platformMediaId: platformUrl ?? `yt-${input.jobId}-${Date.now()}`,
        platformUrl,
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)

      try {
        const pages = context?.pages() ?? []
        const page = pages[pages.length - 1]
        if (page) await saveDebugScreenshot(page, input.jobId, 'failed')
      } catch {
        // best-effort
      }

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
