import fs from 'node:fs/promises'
import path from 'node:path'

import { config } from '../config'
import { logger } from '../logging/logger'

import { detectLoginOrChallenge } from './loginChallengeDetection'
import { isRealPlatformMediaId, normalizeInstagramMediaUrl } from './platformMediaIds'
import { withAuthenticatedContext } from './playwrightContext'
import { isPlaywrightProfileBusyError } from './playwrightProfileLock'
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

async function resolveOwnUsername(page: import('playwright').Page): Promise<string | null> {
  const hrefs = await page
    .locator('a[href^="/"]')
    .evaluateAll((els) =>
      els.map((el) => {
        const anchor = el as { getAttribute: (name: string) => string | null }
        return anchor.getAttribute('href') || ''
      }),
    )
    .catch(() => [] as string[])

  for (const href of hrefs) {
    const match = href.match(/^\/([A-Za-z0-9._]{2,30})\/?$/)
    if (!match) continue
    const username = match[1]
    const reserved = new Set([
      'explore',
      'reels',
      'direct',
      'accounts',
      'stories',
      'about',
      'legal',
      'developer',
      'directory',
      'web',
      'api',
      'p',
      'tv',
      'reel',
      'tags',
      'locations',
    ])
    if (reserved.has(username.toLowerCase())) continue
    return username
  }
  return null
}

async function openOwnProfile(page: import('playwright').Page): Promise<void> {
  await page.keyboard.press('Escape').catch(() => undefined)
  await humanPause(400, 800)
  await page.keyboard.press('Escape').catch(() => undefined)

  const username = await resolveOwnUsername(page)
  if (username) {
    await page.goto(`https://www.instagram.com/${username}/`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })
    await humanReadingPause()
    return
  }

  const opened = await clickFirstVisible(
    page,
    [
      'span:has-text("Profile")',
      'a[role="link"]:has-text("Profile")',
      'a[role="link"]:has(img[alt*="profile picture" i])',
      'a[href*="/"][role="link"]:has(img[alt*="profile" i])',
    ],
    12_000,
  ).catch(() => false)

  if (!opened) {
    await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await humanPause(800, 1500)
    await clickFirstVisible(
      page,
      ['span:has-text("Profile")', 'a[role="link"]:has-text("Profile")'],
      15_000,
    ).catch(() => false)
  }

  await humanReadingPause()
}

/**
 * Newest reel/post URL on the logged-in profile grid.
 * Synthetic ig-<jobId>-<timestamp> IDs are NOT allowed — they caused false "uploaded" status.
 */
async function captureLatestReelUrl(
  page: import('playwright').Page,
  jobId: string,
): Promise<string | null> {
  await openOwnProfile(page)
  // Prefer the Posts grid — /reels/ tab often omits stable /reel/ hrefs until scroll.
  await humanPause(1500, 3000)

  const candidates = page.locator('a[href*="/reel/"], a[href*="/p/"], a[href*="/tv/"]')
  const count = await candidates.count().catch(() => 0)
  for (let i = 0; i < Math.min(count, 12); i++) {
    const href = await candidates.nth(i).getAttribute('href').catch(() => null)
    if (!href) continue
    const normalized = normalizeInstagramMediaUrl(href)
    if (normalized) {
      logger.info({ msg: 'Captured Instagram media URL from profile', jobId, url: normalized })
      return normalized
    }
  }

  // Fallback: Reels tab
  await clickFirstVisible(
    page,
    [
      'a[href$="/reels/"]',
      'a[role="tab"]:has-text("Reels")',
      'a:has-text("Reels")',
      '[role="tab"]:has-text("Reels")',
    ],
    8_000,
  ).catch(() => false)
  await humanPause(1500, 3000)

  const reelCandidates = page.locator('a[href*="/reel/"], a[href*="/p/"], a[href*="/tv/"]')
  const reelCount = await reelCandidates.count().catch(() => 0)
  for (let i = 0; i < Math.min(reelCount, 12); i++) {
    const href = await reelCandidates.nth(i).getAttribute('href').catch(() => null)
    if (!href) continue
    const normalized = normalizeInstagramMediaUrl(href)
    if (normalized) {
      logger.info({ msg: 'Captured Instagram media URL from reels tab', jobId, url: normalized })
      return normalized
    }
  }

  const current = normalizeInstagramMediaUrl(page.url())
  return current
}

async function dismissBlockingDialogs(
  page: import('playwright').Page,
  jobId: string,
): Promise<void> {
  // Instagram interstitial: "Video posts are now shared as reels" — blocks Crop/Next/Share.
  const dismissed = await clickFirstVisible(
    page,
    [
      'div[role="dialog"] button:has-text("OK")',
      'div[role="dialog"] div[role="button"]:has-text("OK")',
      'button:has-text("OK")',
      'div[role="button"]:has-text("OK")',
    ],
    2_500,
  ).catch(() => false)

  if (dismissed) {
    logger.info({ msg: 'Dismissed Instagram blocking dialog (OK)', jobId })
    await humanPause(500, 1000)
  }

  // Cookie / notification prompts (best-effort)
  await clickFirstVisible(
    page,
    [
      'button:has-text("Not Now")',
      'button:has-text("Not now")',
      'div[role="button"]:has-text("Not Now")',
      'button:has-text("Allow all cookies")',
      'button:has-text("Decline optional cookies")',
    ],
    1_500,
  ).catch(() => false)
}

/**
 * Only accept media links from a post-share success dialog.
 * Never scrape feed /p/ links — that caused false "uploaded" to random accounts.
 */
async function captureShareSuccessMediaUrl(
  page: import('playwright').Page,
  jobId: string,
): Promise<string | null> {
  const successDialog = page
    .locator('div[role="dialog"]')
    .filter({
      hasText: /reel has been shared|post has been shared|Your reel has been shared|Your post has been shared|Reel shared|Post shared/i,
    })
    .first()

  if (await successDialog.isVisible({ timeout: 3_000 }).catch(() => false)) {
    const link = successDialog.locator('a[href*="/reel/"], a[href*="/p/"], a[href*="/tv/"]').first()
    if (await link.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const href = await link.getAttribute('href').catch(() => null)
      const normalized = href ? normalizeInstagramMediaUrl(href) : null
      if (normalized) {
        logger.info({ msg: 'Captured Instagram media URL from success dialog', jobId, url: normalized })
        return normalized
      }
    }

    const seePost = successDialog
      .locator('a:has-text("See post"), button:has-text("See post"), div[role="button"]:has-text("See post")')
      .first()
    if (await seePost.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await humanClick(page, seePost)
      await humanPause(1500, 3000)
      const fromUrl = normalizeInstagramMediaUrl(page.url())
      if (fromUrl) {
        logger.info({ msg: 'Captured Instagram media URL via See post', jobId, url: fromUrl })
        return fromUrl
      }
    }
  }

  return null
}

function urlsEqual(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  return a.replace(/\/$/, '') === b.replace(/\/$/, '')
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

    const localFilePath = input.localFilePath

    try {
      return await withAuthenticatedContext(profilePath, async (context) => {
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

      await dismissBlockingDialogs(page, input.jobId)

      // Snapshot newest reel BEFORE create so we can prove a new post appeared after Share.
      const baselineReelUrl = await captureLatestReelUrl(page, input.jobId).catch(() => null)
      logger.info({
        msg: 'Instagram baseline reel snapshot',
        jobId: input.jobId,
        baselineReelUrl,
      })
      await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await humanReadingPause()
      await dismissBlockingDialogs(page, input.jobId)

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

      async function waitForFileInput(timeoutMs: number): Promise<boolean> {
        const scoped = page.locator('div[role="dialog"] input[type="file"], input[type="file"]').first()
        const attached = await scoped
          .waitFor({ state: 'attached', timeout: timeoutMs })
          .then(() => true)
          .catch(() => false)
        if (attached) return true
        const count = await page.locator('input[type="file"]').count().catch(() => 0)
        return count > 0
      }

      for (let attempt = 0; attempt < 5 && !fileInputReady; attempt++) {
        await page.keyboard.press('Escape').catch(() => undefined)
        await humanPause(300, 600)
        await dismissBlockingDialogs(page, input.jobId)

        // Mid-loop fallback: direct create URL (IG sometimes skips the Create nav).
        if (attempt >= 2) {
          await page.goto('https://www.instagram.com/', {
            waitUntil: 'domcontentloaded',
            timeout: 60_000,
          })
          await humanReadingPause()
          await dismissBlockingDialogs(page, input.jobId)
        }

        const clicked = await clickCreateEntry()
        if (!clicked && attempt === 0) {
          await page.goto('https://www.instagram.com/', {
            waitUntil: 'domcontentloaded',
            timeout: 60_000,
          })
          await humanReadingPause()
          await dismissBlockingDialogs(page, input.jobId)
          await clickCreateEntry()
        }

        // Newer IG Create flyout: Post / Live video / Ad (no Reel).
        // "Live video" is unique to this flyout — use it to scope the Post click.
        let menuClicked = false
        const liveVideo = page.getByText('Live video', { exact: true }).first()
        if (await liveVideo.isVisible({ timeout: 5_000 }).catch(() => false)) {
          menuClicked = await page
            .evaluate(() => {
              const all = Array.from(document.querySelectorAll('div, span, a, button, li'))
              const liveEl = all.find((el) => (el.textContent || '').trim() === 'Live video')
              if (!liveEl) return false
              let root: HTMLElement | null = liveEl.parentElement
              for (let i = 0; i < 8 && root; i++) {
                const postEl = Array.from(root.querySelectorAll('div, span, a, button, li')).find(
                  (el) => (el.textContent || '').trim() === 'Post',
                ) as HTMLElement | undefined
                if (postEl) {
                  postEl.click()
                  return true
                }
                root = root.parentElement
              }
              return false
            })
            .catch(() => false)
          if (menuClicked) await humanPause(1000, 2000)
        }

        if (!menuClicked) {
          menuClicked = await clickFirstVisible(
            page,
            [
              'div[role="dialog"] div[role="menuitem"]:has-text("Post")',
              'div[role="dialog"] div[role="menuitem"]:has-text("Reel")',
              '[role="menu"] [role="menuitem"]:has-text("Post")',
              '[role="menu"] [role="menuitem"]:has-text("Reel")',
              'div[role="menuitem"]:has-text("Post")',
              'div[role="menuitem"]:has-text("Reel")',
            ],
            5_000,
          ).catch(() => false)
        }

        if (!menuClicked) {
          await waitForCreateDialog(8_000)
        } else {
          await waitForCreateDialog(15_000)
        }

        await dismissBlockingDialogs(page, input.jobId)

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
          10_000,
        ).catch(() => false)

        // File inputs may be hidden; attached is enough for setInputFiles.
        fileInputReady = await waitForFileInput(attempt >= 3 ? 25_000 : 15_000)

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
      await fileInput.setInputFiles(localFilePath)
      await humanReadingPause()
      await dismissBlockingDialogs(page, input.jobId)

      // Crop → Filters → caption: click Next up to 4 times when present.
      for (let i = 0; i < 4; i++) {
        await dismissBlockingDialogs(page, input.jobId)
        const next = page
          .locator(
            'div[role="dialog"] div[role="button"]:has-text("Next"), div[role="dialog"] button:has-text("Next"), div[role="button"]:has-text("Next"), button:has-text("Next")',
          )
          .first()
        if (await next.isVisible({ timeout: 10_000 }).catch(() => false)) {
          await humanClick(page, next)
          await humanPause()
        } else {
          break
        }
      }

      await dismissBlockingDialogs(page, input.jobId)

      const caption =
        input.metadata.instagramCaption?.trim() ||
        'New short update. #reels'

      const captionField = await firstAttached(
        page,
        [
          'div[aria-label="Write a caption..."]',
          'div[aria-label*="Write a caption"]',
          'div[role="dialog"] div[aria-label*="Write a caption"]',
          'div[role="dialog"] [contenteditable="true"][aria-label*="Write a caption"]',
          'div[role="dialog"] [contenteditable="true"][aria-label*="caption" i]',
          'div[role="dialog"] div[role="textbox"]',
          'textarea[aria-label*="caption" i]',
          'textarea[placeholder*="Write a caption"]',
          'div[contenteditable="true"][aria-label*="caption" i]',
          'div[role="textbox"][aria-label*="caption" i]',
        ],
        45_000,
      ).catch(() => null)

      if (captionField) {
        await humanType(captionField, caption.substring(0, 2200), { clearFirst: true })
      } else {
        await dismissBlockingDialogs(page, input.jobId)
        const retryCaption = await firstAttached(
          page,
          [
            'div[aria-label*="Write a caption"]',
            'div[role="dialog"] [contenteditable="true"]',
          ],
          15_000,
        ).catch(() => null)
        if (retryCaption) {
          await humanType(retryCaption, caption.substring(0, 2200), { clearFirst: true })
        } else {
          logger.warn({
            msg: 'Instagram caption field not found — continuing to Share',
            jobId: input.jobId,
          })
          await saveDebugScreenshot(page, input.jobId, 'caption-missing')
        }
      }

      await humanPause()
      await dismissBlockingDialogs(page, input.jobId)

      // Still on Crop? Do not click a stray Share elsewhere on the page.
      const stillOnCrop = await page
        .locator('div[role="dialog"]')
        .filter({ hasText: /^Crop$|Crop/i })
        .locator('div[role="button"]:has-text("Next"), button:has-text("Next")')
        .first()
        .isVisible({ timeout: 1_500 })
        .catch(() => false)
      if (stillOnCrop) {
        await saveDebugScreenshot(page, input.jobId, 'stuck-on-crop')
        throw new Error(
          'Instagram still on Crop step after Next attempts — likely blocked by a dialog (e.g. Reels OK modal)',
        )
      }

      const shareButton = page
        .locator('div[role="dialog"]')
        .locator('div[role="button"]:has-text("Share"), button:has-text("Share")')
        .first()
      const shareVisible = await shareButton.isVisible({ timeout: 30_000 }).catch(() => false)
      if (!shareVisible) {
        await saveDebugScreenshot(page, input.jobId, 'share-missing')
        throw new Error('Instagram Share button not found in create dialog')
      }
      await humanClick(page, shareButton)

      // HARD RULE: no share confirmation toast/dialog ⇒ failure.
      // Never scrape feed /p/ links to invent a "success" URL.
      // NOTE: Playwright selector lists only work for CSS engines — do NOT join
      // multiple `text=` engines with commas (that silently fails to match).
      const shareSuccessText = page.getByText(
        /Your reel has been shared\.?|Reel shared|Your post has been shared\.?|Post shared/i,
      )
      const shareSuccessDialog = page.locator('div[role="dialog"]').filter({
        hasText:
          /Your reel has been shared\.?|Reel shared|Your post has been shared\.?|Post shared/i,
      })
      const shareConfirmed = await shareSuccessText
        .or(shareSuccessDialog)
        .first()
        .waitFor({ state: 'visible', timeout: 120_000 })
        .then(() => true)
        .catch(() => false)

      if (!shareConfirmed) {
        await saveDebugScreenshot(page, input.jobId, 'share-toast-missing')
        throw new Error(
          'Instagram Share was clicked but no share-confirmation toast appeared. ' +
            'Treating as FAILED (will not scrape feed links as a fake success).',
        )
      }

      logger.info({
        msg: 'Instagram share confirmation visible',
        jobId: input.jobId,
      })

      await humanReadingPause()

      const postChallenge = await detectLoginOrChallenge(page)
      if (postChallenge.loginRequired) {
        return loginRequiredResult(
          'INSTAGRAM_LOGIN_REQUIRED',
          postChallenge.reason ?? 'Instagram blocked publish — manual review required.',
        )
      }

      // Prefer URL from the success dialog only; else require a NEW profile reel vs baseline.
      let reelUrl = await captureShareSuccessMediaUrl(page, input.jobId)

      // Close success modal so profile navigation is reliable.
      await clickFirstVisible(
        page,
        [
          'div[role="dialog"] button:has-text("Done")',
          'div[role="dialog"] div[role="button"]:has-text("Done")',
          'button:has-text("Done")',
          'div[role="button"]:has-text("Done")',
        ],
        5_000,
      ).catch(() => false)

      if (!reelUrl || urlsEqual(reelUrl, baselineReelUrl)) {
        for (let attempt = 0; attempt < 3; attempt++) {
          await humanPause(2500, 4500)
          const latest = await captureLatestReelUrl(page, input.jobId)
          if (latest && !urlsEqual(latest, baselineReelUrl)) {
            reelUrl = latest
            break
          }
        }
      }

      if (!reelUrl || !isRealPlatformMediaId('instagram', reelUrl)) {
        await saveDebugScreenshot(page, input.jobId, 'reel-url-missing')
        throw new Error(
          'Instagram share toast seen but no real reel/post URL could be confirmed. Treating as FAILED.',
        )
      }

      if (urlsEqual(reelUrl, baselineReelUrl)) {
        await saveDebugScreenshot(page, input.jobId, 'reel-url-unchanged')
        throw new Error(
          'Instagram share toast seen but profile newest reel is unchanged. Treating as FAILED.',
        )
      }

      logger.info({
        msg: 'Instagram upload completed',
        jobId: input.jobId,
        account: input.account.accountLabel,
        platformUrl: reelUrl,
        baselineReelUrl,
        shareToastSeen: true,
      })

      return {
        success: true,
        platformMediaId: reelUrl,
        platformUrl: reelUrl,
      }
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)

      if (isLoginRelatedError(msg)) {
        return loginRequiredResult('INSTAGRAM_LOGIN_REQUIRED', msg)
      }

      if (isPlaywrightProfileBusyError(err) || msg.includes('PROFILE_BUSY')) {
        logger.warn({ msg: 'Instagram profile busy — transient', jobId: input.jobId, error: msg })
        return { success: false, errorCode: 'PROFILE_BUSY', errorMessage: msg }
      }

      logger.error({ msg: 'Instagram upload failed', jobId: input.jobId, error: msg })
      return { success: false, errorCode: 'INSTAGRAM_UPLOAD_FAILED', errorMessage: msg }
    }
  }
}
