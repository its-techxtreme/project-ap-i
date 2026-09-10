import fs from 'node:fs/promises'
import path from 'node:path'

import { logger } from '../logging/logger'
import { config } from '../config'

import { detectLoginOrChallenge } from './loginChallengeDetection'
import { withAuthenticatedContext } from './playwrightContext'
import { isPlaywrightProfileBusyError } from './playwrightProfileLock'
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
import {
  extractYoutubeVideoId,
  normalizeYoutubeMediaUrl,
  youtubeUrlFromVideoId,
} from './platformMediaIds'
import type { PlatformUploader, SessionHealth, UploadInput, UploadResult } from './types'

// YouTube Studio upload. Overlay dismiss must not Escape the whole dialog.
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
  // Debug PNG only. Never throw out of here.
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

function toPublicYoutubeUrl(candidate: string | null | undefined): string | undefined {
  if (!candidate) return undefined
  return normalizeYoutubeMediaUrl(candidate) ?? undefined
}

/**
 * Studio's upload flow is a modal dialog. Escape closes the *entire* upload
 * dialog (not just hashtag/suggestion popovers) — that was aborting metadata
 * mid-title. Click a dead corner of the scroll area — never #audience (Learn more
 * / help links live there and steal the navigation to the kids policy page).
 */
async function dismissYoutubeStudioOverlays(
  page: import('playwright').Page,
): Promise<void> {
  const scroll = page
    .locator('ytcp-uploads-dialog #scrollable-content, #scrollable-content')
    .first()
  if (await scroll.isVisible({ timeout: 1_500 }).catch(() => false)) {
    await scroll.click({ position: { x: 12, y: 12 }, force: true }).catch(() => undefined)
  } else {
    await page.keyboard.press('Tab').catch(() => undefined)
  }
  await humanPause(200, 450)
}

const KIDS_NOT_MADE_FOR_KIDS_SELECTORS = [
  'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"] #radio',
  'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
  '#audience tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
  'ytcp-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
] as const

function isKidsHelpUrl(url: string): boolean {
  return /support\.google\.com|made[- ]?for[- ]?kids|youtube\.com\/t\/|howyoutubeworks/i.test(url)
}

async function isNotMadeForKidsSelected(page: import('playwright').Page): Promise<boolean> {
  const radio = page
    .locator('tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]')
    .first()
  if ((await radio.count().catch(() => 0)) === 0) return false

  const aria = await radio.getAttribute('aria-checked').catch(() => null)
  if (aria === 'true') return true

  return radio
    .evaluate((el) => {
      const node = el as {
        getAttribute: (n: string) => string | null
        classList: { contains: (c: string) => boolean }
        querySelector: (s: string) => unknown
      }
      return (
        node.getAttribute('aria-checked') === 'true' ||
        node.classList.contains('iron-selected') ||
        node.classList.contains('selected') ||
        !!node.querySelector('[aria-checked="true"]')
      )
    })
    .catch(() => false)
}

/** True if we are still in Studio upload UI (dialog may flicker during "Saving..."). */
async function isStillInYoutubeUploadUi(page: import('playwright').Page): Promise<boolean> {
  if (isKidsHelpUrl(page.url())) return false

  const urlOk = /studio\.youtube\.com|youtube\.com\/upload/i.test(page.url())
  const markers = [
    'ytcp-uploads-dialog',
    'ytcp-video-metadata-editor',
    'ytcp-button#next-button',
    '#next-button',
    'button:has-text("Next")',
    'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
    'text=Checks complete',
    'text=Details',
  ]
  for (const sel of markers) {
    if (await page.locator(sel).first().isVisible({ timeout: 800 }).catch(() => false)) {
      return true
    }
  }
  // During "Saving..." custom elements can report not-visible briefly — DOM still present.
  if (
    (await page.locator('ytcp-uploads-dialog, ytcp-video-metadata-editor, #next-button').count()) >
    0
  ) {
    return true
  }
  return urlOk
}

async function waitForYoutubeDetailsSaved(page: import('playwright').Page): Promise<void> {
  await page
    .locator('text=Saving...')
    .first()
    .waitFor({ state: 'hidden', timeout: 90_000 })
    .catch(() => undefined)
  await humanPause(300, 700)
}

/**
 * Click the NOT_MFK radio with a fixed point — humanClick's random coords can land on
 * "What is Made for Kids content?" and open help / collapse the dialog check.
 */
async function clickNotMadeForKidsRadio(page: import('playwright').Page): Promise<boolean> {
  for (const sel of KIDS_NOT_MADE_FOR_KIDS_SELECTORS) {
    const loc = page.locator(sel).first()
    if (!(await loc.isVisible({ timeout: 1_500 }).catch(() => false))) continue

    await loc.scrollIntoViewIfNeeded().catch(() => undefined)
    await humanPause(400, 900)

    const clicked = await loc
      .click({ force: true, timeout: 5_000, position: { x: 5, y: 5 } })
      .then(() => true)
      .catch(async () => {
        await loc.evaluate((el) => {
          const host =
            (el.closest && el.closest('tp-yt-paper-radio-button')) ||
            (el.closest && el.closest('ytcp-radio-button')) ||
            el
          ;(host as unknown as HTMLElement).click()
        })
        return true
      })
      .catch(() => false)

    if (!clicked) continue
    await humanPause(500, 1000)
    await waitForYoutubeDetailsSaved(page)
    if (await isNotMadeForKidsSelected(page)) return true
    // Studio sometimes delays aria-checked; click landed and dialog still open is enough.
    if (await isStillInYoutubeUploadUi(page)) return true
  }
  return false
}

/** If a "Learn more" / kids policy click navigated away, return to Studio upload. */
async function recoverFromKidsHelpPage(page: import('playwright').Page): Promise<void> {
  if (!isKidsHelpUrl(page.url())) return

  logger.warn({
    msg: 'YouTube upload navigated to Made for Kids help — returning to Studio',
    url: page.url(),
  })
  await page.goBack({ waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(async () => {
    await page.goto('https://studio.youtube.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })
  })
  await humanPause(800, 1600)
}

/**
 * Select "No, it's not made for kids" via radio name only.
 * Never use text= selectors — they match help copy / Learn more and leave Studio.
 */
async function selectNotMadeForKids(
  page: import('playwright').Page,
  jobId: string,
): Promise<void> {
  const onPopup = (popup: import('playwright').Page) => {
    void (async () => {
      await humanPause(200, 400)
      if (isKidsHelpUrl(popup.url())) {
        logger.warn({ msg: 'Closing Made for Kids help popup', url: popup.url(), jobId })
        await popup.close().catch(() => undefined)
      }
    })()
  }
  page.on('popup', onPopup)

  try {
    await recoverFromKidsHelpPage(page)

    // Already selected (e.g. Studio remembered) — do not re-click near help links.
    if (await isNotMadeForKidsSelected(page)) {
      logger.info({ msg: 'YouTube NOT_MFK already selected', jobId })
      await waitForYoutubeDetailsSaved(page)
      return
    }

    const answered = await clickNotMadeForKidsRadio(page)
    await recoverFromKidsHelpPage(page)
    await waitForYoutubeDetailsSaved(page)

    const selected = answered || (await isNotMadeForKidsSelected(page))
    if (!selected || isKidsHelpUrl(page.url())) {
      await saveDebugScreenshot(page, jobId, 'kids-missing')
      throw new Error(
        'YouTube audience question not answered — must select "No, it\'s not made for kids"',
      )
    }

    // Prefer selection truth over brittle dialog visibility (false failed during "Saving...").
    if (!(await isStillInYoutubeUploadUi(page))) {
      await saveDebugScreenshot(page, jobId, 'kids-left-dialog')
      // If radio is still selected on a Studio URL, continue — dialog host may be flaky.
      if (!(await isNotMadeForKidsSelected(page)) || !/studio\.youtube\.com/i.test(page.url())) {
        throw new Error(
          'YouTube upload dialog closed or left after audience click (kids help navigation?)',
        )
      }
      logger.warn({
        msg: 'Upload UI visibility flaky after NOT_MFK — continuing because radio is selected',
        jobId,
        url: page.url(),
      })
    }
  } finally {
    page.off('popup', onPopup)
  }
}

/**
 * Extract published video URL after Publish.
 * Studio often delays the share dialog; the video id usually appears first in the
 * Studio URL (`/video/<id>/…`), then in share anchors/inputs, then in page HTML.
 */
async function captureYoutubeShareUrl(page: import('playwright').Page): Promise<string | undefined> {
  const fromPageUrl = toPublicYoutubeUrl(page.url())
  if (fromPageUrl) return fromPageUrl

  const linkSelectors = [
    'a[href*="youtu.be/"]',
    'a[href*="youtube.com/watch"]',
    'a[href*="youtube.com/shorts/"]',
    'a[href*="studio.youtube.com/video/"]',
  ]
  for (const sel of linkSelectors) {
    const link = page.locator(sel).first()
    if ((await link.count().catch(() => 0)) === 0) continue
    const href = await link.getAttribute('href').catch(() => null)
    const url = toPublicYoutubeUrl(href ?? undefined)
    if (url) return url
  }

  const input = page
    .locator(
      [
        'input[value*="youtu.be/"]',
        'input[value*="youtube.com/watch"]',
        'input[value*="youtube.com/shorts/"]',
        'input[value*="studio.youtube.com/video/"]',
        'ytcp-video-share-dialog input',
        '#share-url',
        'tp-yt-paper-input input',
      ].join(', '),
    )
    .first()
  if ((await input.count().catch(() => 0)) > 0) {
    const value =
      (await input.inputValue().catch(() => '')) ||
      (await input.getAttribute('value').catch(() => '')) ||
      ''
    const url = toPublicYoutubeUrl(value.trim())
    if (url) return url
  }

  // Prefer page.content() over page.evaluate() so Node typecheck does not need DOM libs.
  const html = await page.content().catch(() => '')
  const fromHtml = extractYoutubeVideoId(`${page.url()}\n${html}`)
  if (fromHtml) return youtubeUrlFromVideoId(fromHtml)

  const bodyText = await page.locator('body').innerText({ timeout: 2_000 }).catch(() => '')
  const fromText = extractYoutubeVideoId(bodyText)
  if (fromText) return youtubeUrlFromVideoId(fromText)

  return undefined
}

/** Poll + open Share/Copy-link controls until a real public URL is available. */
async function resolvePublishedYoutubeUrl(
  page: import('playwright').Page,
): Promise<string | undefined> {
  const shareSelectors = [
    'ytcp-button:has-text("Share")',
    'button:has-text("Share")',
    '#share-button',
    '[aria-label*="Share" i]',
    'ytcp-video-share-dialog button',
  ]
  const copySelectors = [
    'ytcp-button:has-text("Copy")',
    'button:has-text("Copy link")',
    'button:has-text("Copy")',
    '[aria-label*="Copy" i]',
  ]

  for (let attempt = 0; attempt < 6; attempt++) {
    const found = await captureYoutubeShareUrl(page)
    if (found) return found

    if (attempt === 1 || attempt === 3) {
      await clickFirstVisible(page, shareSelectors, 2_500).catch(() => false)
      await humanPause(800, 1_500)
    }
    if (attempt === 2 || attempt === 4) {
      await clickFirstVisible(page, copySelectors, 2_000).catch(() => false)
      await humanPause(500, 1_000)
      const clip = await page
        .evaluate(`async () => {
          try { return await navigator.clipboard.readText() } catch { return '' }
        }`)
        .catch(() => '')
      const fromClip = toPublicYoutubeUrl(typeof clip === 'string' ? clip : '')
      if (fromClip) return fromClip
    }

    await humanPause(1_500, 2_500)
  }

  return captureYoutubeShareUrl(page)
}

function normalizeTitleForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[#|]/g, ' ')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * After Publish, Studio content list often has the new Short before the share dialog.
 * Match by youtube title and return a public youtu.be URL.
 */
async function recoverYoutubeUrlFromStudioContent(
  page: import('playwright').Page,
  expectedTitle: string | undefined,
): Promise<string | undefined> {
  const needle = expectedTitle ? normalizeTitleForMatch(expectedTitle) : ''
  try {
    await page.goto('https://studio.youtube.com/channel/UC/videos', {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    })
  } catch {
    try {
      await page.goto('https://studio.youtube.com/', {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      })
      await clickFirstVisible(
        page,
        ['a[href*="/videos"]', 'tp-yt-paper-item:has-text("Content")', 'text=Content'],
        8_000,
      ).catch(() => false)
    } catch {
      return undefined
    }
  }

  await humanPause(2_000, 3_500)

  const html = await page.content().catch(() => '')
  const pageUrl = page.url()

  // Prefer row that mentions the title, then any recent /video/<id> link.
  if (needle.length >= 8) {
    const rows = await page.locator('ytcp-video-row, ytcp-video-section-entry, tr').all()
    for (const row of rows.slice(0, 25)) {
      const text = normalizeTitleForMatch((await row.innerText().catch(() => '')) || '')
      if (!text.includes(needle.slice(0, Math.min(24, needle.length)))) continue
      const href =
        (await row.locator('a[href*="/video/"]').first().getAttribute('href').catch(() => null)) ||
        (await row.locator('a[href*="youtu.be/"]').first().getAttribute('href').catch(() => null))
      const url = toPublicYoutubeUrl(href ?? undefined)
      if (url) return url
    }
  }

  return toPublicYoutubeUrl(pageUrl) ?? (() => {
    const id = extractYoutubeVideoId(html)
    return id ? youtubeUrlFromVideoId(id) : undefined
  })()
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

    const localFilePath = input.localFilePath

    try {
      return await withAuthenticatedContext(profilePath, async (context) => {
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
      await fileInput.setInputFiles(localFilePath)

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
      // Never Escape here — it closes the Studio upload dialog mid-metadata.
      await dismissYoutubeStudioOverlays(page)
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
          await dismissYoutubeStudioOverlays(page)
        }
      }

      // Hard rule: always "No, it's not made for kids" (radio name only — never help links).
      await dismissYoutubeStudioOverlays(page)
      await selectNotMadeForKids(page, input.jobId)
      await humanPause(800, 1600)

      // Dismiss policy/AI banners only — never generic dialog Close (that aborts upload).
      await clickFirstVisible(
        page,
        [
          'ytcp-banner button:has-text("Got it")',
          'ytcp-banner button:has-text("Dismiss")',
          'tp-yt-paper-toast button:has-text("Got it")',
          'ytcp-uploads-dialog ytcp-button:has-text("Got it")',
        ],
        5_000,
      ).catch(() => false)

      await humanPause()

      // Details → Video elements → Checks → Visibility (up to 4 Next clicks)
      for (let i = 0; i < 4; i++) {
        const nextEnabled = page.locator('#next-button:not([disabled]), ytcp-button#next-button:not([aria-disabled="true"])').first()
        const ready = await nextEnabled.isVisible({ timeout: 20_000 }).catch(() => false)
        if (!ready) {
          // Still blocked — re-assert kids audience via precise radio click.
          if (!(await isNotMadeForKidsSelected(page))) {
            await clickNotMadeForKidsRadio(page).catch(() => false)
          }
          await recoverFromKidsHelpPage(page)
          await waitForYoutubeDetailsSaved(page)
          await dismissYoutubeStudioOverlays(page)
        }

        await waitForYoutubeDetailsSaved(page)

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

      // Prefer Studio URL / share dialog / copy-link — never invent yt-<jobId> ids.
      let platformUrl = await resolvePublishedYoutubeUrl(page)

      const postChallenge = await detectLoginOrChallenge(page)
      if (postChallenge.loginRequired) {
        return loginRequiredResult(
          'YOUTUBE_LOGIN_REQUIRED',
          postChallenge.reason ?? 'YouTube blocked publish — manual review required.',
        )
      }

      if (!platformUrl) {
        await saveDebugScreenshot(page, input.jobId, 'share-url-missing')
        await humanPause(3000, 5000)
        platformUrl = await resolvePublishedYoutubeUrl(page)
      }

      if (!platformUrl) {
        platformUrl = await recoverYoutubeUrlFromStudioContent(page, input.metadata.youtubeTitle)
        if (platformUrl) {
          logger.info({
            msg: 'YouTube URL recovered from Studio content list',
            jobId: input.jobId,
            platformUrl,
          })
        }
      }

      if (!platformUrl) {
        throw new Error(
          'YOUTUBE_URL_CAPTURE_FAILED: YouTube publish clicked but no video URL was captured — refusing synthetic media id',
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
        platformMediaId: platformUrl,
        platformUrl,
      }
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)

      if (isLoginRelatedError(msg)) {
        return loginRequiredResult('YOUTUBE_LOGIN_REQUIRED', msg)
      }

      if (isPlaywrightProfileBusyError(err) || msg.includes('PROFILE_BUSY')) {
        logger.warn({ msg: 'YouTube profile busy — transient', jobId: input.jobId, error: msg })
        return { success: false, errorCode: 'PROFILE_BUSY', errorMessage: msg }
      }

      logger.error({ msg: 'YouTube upload failed', jobId: input.jobId, error: msg })
      return { success: false, errorCode: 'YOUTUBE_UPLOAD_FAILED', errorMessage: msg }
    }
  }
}
