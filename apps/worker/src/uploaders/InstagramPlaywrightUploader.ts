import fs from 'node:fs/promises'
import path from 'node:path'

import { config } from '../config'
import { logger } from '../logging/logger'

import { detectLoginOrChallenge } from './loginChallengeDetection'
import { launchAuthenticatedContext } from './playwrightContext'
import {
  clickFirstVisible,
  firstAttached,
  humanClick,
  humanIdleMotion,
  humanPause,
  humanReadingPause,
  humanScroll,
  humanSetFiles,
  humanType,
  randomInt,
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
    const file = path.join(dir, `ig-${jobId.slice(0, 8)}-${label}-${Date.now()}.png`)
    await page.screenshot({ path: file, fullPage: true })
    logger.warn({ msg: 'Instagram upload debug screenshot saved', jobId, file })
  } catch {
    // best-effort
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
      if (Math.random() > 0.5) await humanIdleMotion(page)

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

      // Open create flow. IG web often needs a hard click on the New post SVG / parent,
      // then Post/Reel from the popover, then Select from computer.
      let fileInputReady = false

      async function clickCreateEntry(): Promise<boolean> {
        const candidates = [
          page.locator('svg[aria-label="New post"]').first(),
          page.locator('[aria-label="New post"]').first(),
          page.getByRole('link', { name: /^Create$/i }).first(),
          page.getByRole('button', { name: /^Create$/i }).first(),
          page.locator('a').filter({ hasText: /^Create$/ }).first(),
          page.locator('div[role="link"]').filter({ hasText: /^Create$/ }).first(),
        ]

        for (const loc of candidates) {
          if (!(await loc.isVisible().catch(() => false))) continue

          // Prefer clicking the interactive ancestor of the SVG icon.
          const clickTarget = loc.locator(
            'xpath=ancestor-or-self::a[1] | ancestor-or-self::*[@role="link" or @role="button"][1]',
          ).first()
          const target = (await clickTarget.count().catch(() => 0)) > 0 ? clickTarget : loc

          await target.scrollIntoViewIfNeeded().catch(() => undefined)
          await humanPause(500, 1200)
          // Native Playwright click is more reliable than synthetic mouse for React nav.
          await target.click({ delay: randomInt(80, 180), force: true }).catch(async () => {
            await humanClick(page, target)
          })
          await humanPause(800, 1600)
          return true
        }
        return false
      }

      async function waitForCreateDialog(timeoutMs: number): Promise<boolean> {
        const dialog = page.locator('div[role="dialog"]').first()
        return dialog
          .waitFor({ state: 'visible', timeout: timeoutMs })
          .then(() => true)
          .catch(() => false)
      }

      for (let attempt = 0; attempt < 5 && !fileInputReady; attempt++) {
        await page.keyboard.press('Escape').catch(() => undefined)
        await humanPause(300, 600)

        const clicked = await clickCreateEntry()
        if (!clicked && attempt === 0) {
          await page.goto('https://www.instagram.com/', {
            waitUntil: 'domcontentloaded',
            timeout: 60_000,
          })
          await humanReadingPause()
          await clickCreateEntry()
        }

        // Popover: Post / Reel / Story — click Post first (works for video too).
        const menuClicked = await clickFirstVisible(
          page,
          [
            'div[role="dialog"] div[role="menuitem"]:has-text("Post")',
            'div[role="dialog"] div[role="menuitem"]:has-text("Reel")',
            '[role="menu"] [role="menuitem"]:has-text("Post")',
            '[role="menu"] [role="menuitem"]:has-text("Reel")',
            'div[role="menuitem"]:has-text("Post")',
            'div[role="menuitem"]:has-text("Reel")',
            'button:has-text("Post")',
            'button:has-text("Reel")',
          ],
          8_000,
        ).catch(() => false)

        if (!menuClicked) {
          // Some builds open the create dialog directly without a menu.
          await waitForCreateDialog(5_000)
        } else {
          await waitForCreateDialog(10_000)
        }

        await clickFirstVisible(
          page,
          [
            'div[role="dialog"] button:has-text("Select from computer")',
            'div[role="dialog"] button:has-text("Select from Computer")',
            'button:has-text("Select from computer")',
            'button:has-text("Select from Computer")',
            'div[role="button"]:has-text("Select from computer")',
            'text=Select from computer',
          ],
          8_000,
        ).catch(() => false)

        // File inputs may be hidden; attached is enough for setInputFiles.
        const fileInput = page.locator('input[type="file"]').first()
        fileInputReady = await fileInput
          .waitFor({ state: 'attached', timeout: 12_000 })
          .then(() => true)
          .catch(() => false)

        if (!fileInputReady) {
          // Last-resort: any file input already in DOM (IG sometimes pre-mounts it).
          const count = await page.locator('input[type="file"]').count().catch(() => 0)
          if (count > 0) {
            fileInputReady = true
          }
        }

        if (!fileInputReady) {
          await saveDebugScreenshot(page, input.jobId, `create-attempt-${attempt}`)
          logger.warn({
            msg: 'Instagram create attempt failed to expose file input',
            jobId: input.jobId,
            attempt,
            url: page.url(),
          })
          await page.goto('https://www.instagram.com/', {
            waitUntil: 'domcontentloaded',
            timeout: 60_000,
          })
          await humanReadingPause()
        }
      }

      if (!fileInputReady) {
        await saveDebugScreenshot(page, input.jobId, 'no-file-input')
        throw new Error('Instagram create dialog did not expose a file input')
      }

      const fileInput = page.locator('input[type="file"]').first()
      await humanSetFiles(fileInput)
      await fileInput.setInputFiles(input.localFilePath)
      await humanReadingPause()

      // Crop → Filters → caption: click Next up to 3 times when present.
      for (let i = 0; i < 3; i++) {
        const next = page
          .locator(
            'div[role="button"]:has-text("Next"), button:has-text("Next"), [role="button"]:has-text("Next")',
          )
          .first()
        if (await next.isVisible({ timeout: 10_000 }).catch(() => false)) {
          await humanClick(page, next)
          await humanPause()
        } else {
          break
        }
      }

      const caption =
        input.metadata.instagramCaption?.trim() ||
        'New short update. #reels'

      const captionField = await firstAttached(
        page,
        [
          'div[aria-label="Write a caption..."]',
          'div[aria-label*="Write a caption"]',
          'div[role="dialog"] div[aria-label*="Write a caption"]',
          'div[role="dialog"] [contenteditable="true"][aria-label*="caption" i]',
          'div[role="dialog"] div[role="textbox"]',
          'textarea[aria-label*="caption" i]',
          'textarea[placeholder*="Write a caption"]',
          'div[contenteditable="true"][aria-label*="caption" i]',
          'div[role="textbox"][aria-label*="caption" i]',
          'div[role="dialog"] [contenteditable="true"]',
        ],
        60_000,
      ).catch(() => null)

      if (captionField) {
        await humanType(captionField, caption.substring(0, 2200), { clearFirst: true })
      } else {
        logger.warn({
          msg: 'Instagram caption field not found — continuing to Share',
          jobId: input.jobId,
        })
        await saveDebugScreenshot(page, input.jobId, 'caption-missing')
      }

      await humanPause()

      const shared = await clickFirstVisible(
        page,
        [
          'div[role="button"]:has-text("Share")',
          'button:has-text("Share")',
          '[role="button"]:has-text("Share")',
        ],
        30_000,
      )

      if (!shared) {
        await saveDebugScreenshot(page, input.jobId, 'share-missing')
        throw new Error('Instagram Share button not found')
      }

      // Wait for share completion toast / dialog close.
      await page
        .locator('text=Your reel has been shared., text=Reel shared, text=Post shared, text=Shared')
        .first()
        .waitFor({ timeout: 120_000 })
        .catch(() => undefined)

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

      try {
        const pages = context?.pages() ?? []
        const page = pages[pages.length - 1]
        if (page) await saveDebugScreenshot(page, input.jobId, 'failed')
      } catch {
        // best-effort
      }

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
