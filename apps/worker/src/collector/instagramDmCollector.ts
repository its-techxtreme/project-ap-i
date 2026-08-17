import path from 'node:path'

import { extractInstagramReelUrls, zipUrlsWithFollowingText } from '@project-api/shared'
import type { Page, Response } from 'playwright'

import { config } from '../config'
import { logger } from '../logging/logger'
import { detectLoginOrChallenge } from '../uploaders/loginChallengeDetection'
import { withAuthenticatedContext } from '../uploaders/playwrightContext'
import { humanPause } from '../uploaders/playwrightHumanBehavior'

import { orderConversationIndexes } from './conversationOrder'
import type { CollectedReel } from './persistCollectedReels'

const MAX_THREADS = 12
const MAX_REELS = 40

export function collectorProfilePath(): string {
  const dir =
    config.PLAYWRIGHT_PROFILES_DIR?.trim() ||
    path.resolve(__dirname, '../../../../playwright-profiles')
  return path.join(dir, config.COLLECTOR_PROFILE)
}

export type ScrapeResult =
  | { ok: true; items: CollectedReel[]; loginRequired: false }
  | { ok: false; items: []; loginRequired: boolean; error: string }

export async function scrapeUnreadCollectorInbox(): Promise<ScrapeResult> {
  const profilePath = collectorProfilePath()

  try {
    return await withAuthenticatedContext(profilePath, async (context) => {
      const page = context.pages()[0] ?? (await context.newPage())
      const harvestedJson: string[] = []
      const onResponse = (res: Response) => {
        void harvestJsonResponse(res, harvestedJson)
      }
      const onRequestUrl = (req: { url: () => string }) => {
        const url = req.url()
        if (/instagram\.com\/(?:reel|reels|p)\//i.test(url)) harvestedJson.push(url)
      }
      page.on('request', onRequestUrl)
      context.on('response', onResponse)
      try {
        const items = await scrapeInboxPage(page, harvestedJson)
        const unique = dedupeItems(items).slice(0, MAX_REELS)
        logger.info({ msg: 'Collector scrape finished', itemCount: unique.length })
        return { ok: true, items: unique, loginRequired: false }
      } finally {
        page.off('request', onRequestUrl)
        context.off('response', onResponse)
      }
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.warn({ msg: 'Collector scrape failed', error: message })
    const loginRequired = /login|2fa|captcha|challenge|profile/i.test(message)
    return { ok: false, items: [], loginRequired, error: message }
  }
}

async function harvestJsonResponse(res: Response, bucket: string[]): Promise<void> {
  try {
    const url = res.url()
    const ct = res.headers()['content-type'] ?? ''
    const looksUseful =
      ct.includes('json') ||
      url.includes('graphql') ||
      url.includes('/api/') ||
      url.includes('direct_v2')
    if (!looksUseful) return
    const text = await res.text()
    if (text.length > 2_000_000) return
    const hasMediaCode = /"(?:code|shortcode)"\s*:\s*"[A-Za-z0-9_-]{8,15}"/.test(text)
    const hasShareShape = /reel|clips|xma|shortcode|organic_tracking_token/i.test(text)
    if (!hasMediaCode && !hasShareShape) return
    bucket.push(text)
  } catch {
    // Body already consumed or non-text — ignore.
  }
}

async function scrapeInboxPage(page: Page, harvestedJson: string[]): Promise<CollectedReel[]> {
  await page.goto('https://www.instagram.com/direct/inbox/', {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  })
  await humanPause(2_000, 4_000)
  await dismissInboxPrompts(page)
  await page
    .getByText(/\d+\+?\s*new messages|you're now friends/i)
    .first()
    .waitFor({ timeout: 20_000 })
    .catch(() => undefined)
  await dismissInboxPrompts(page)

  const challenge = await detectLoginOrChallenge(page)
  if (challenge.loginRequired) {
    throw new Error(challenge.reason ?? challenge.challengeType ?? 'login_required')
  }

  await humanPause(2_000, 3_500)

  const items: CollectedReel[] = []
  const visited = new Set<string>()

  for (let pass = 0; pass < MAX_THREADS; pass++) {
    if (items.length >= MAX_REELS) break
    await dismissInboxPrompts(page)
    if (!page.url().includes('/direct/')) {
      await page
        .goto('https://www.instagram.com/direct/inbox/', {
          waitUntil: 'domcontentloaded',
          timeout: 60_000,
        })
        .catch(() => undefined)
      await humanPause(1_200, 2_000)
      await dismissInboxPrompts(page)
    }

    const labels = await listConversationLabels(page)
    if (pass === 0) {
      logger.info({
        msg: 'Collector inbox threads',
        url: page.url(),
        rowCount: labels.length,
        priorityChat: config.COLLECTOR_PRIORITY_CHAT || null,
        unreadCount: labels.filter((label) => /\bnew messages?\b|\bunread\b/i.test(label)).length,
      })
    }
    if (labels.length === 0) {
      const body = await page.locator('body').innerText().catch(() => '')
      if (/sleep mode|quiet mode|notifications will be muted/i.test(body)) {
        logger.info({ msg: 'Collector retrying after sleep-mode overlay' })
        await dismissInboxPrompts(page)
        await humanPause(800, 1_400)
        continue
      }
      const unreadChip = page.getByText(/\d+\+?\s*new messages/i).first()
      if (await unreadChip.isVisible({ timeout: 800 }).catch(() => false)) {
        logger.info({ msg: 'Collector clicking unread conversation by visible text' })
        await unreadChip.click({ timeout: 3_000 }).catch(() => undefined)
        await humanPause(1_800, 3_000)
        await dismissInboxPrompts(page)
        const jsonMark = harvestedJson.length
        items.push(...(await extractFromOpenThread(page, harvestedJson, jsonMark)))
        await page
          .goto('https://www.instagram.com/direct/inbox/', {
            waitUntil: 'domcontentloaded',
            timeout: 60_000,
          })
          .catch(() => undefined)
        continue
      }
      if (pass < 8) {
        logger.info({ msg: 'Collector waiting for inbox conversation list', pass })
        await humanPause(1_800, 2_800)
        await dismissInboxPrompts(page)
        continue
      }
      await logInboxDebug(page)
      await logInboxGeometry(page)
      break
    }

    const order = orderConversationIndexes(labels, config.COLLECTOR_PRIORITY_CHAT)
    const nextIndex = order.find((i) => {
      const key = labels[i]!.replace(/\s+/g, ' ').trim().toLowerCase()
      return !visited.has(key)
    })
    if (nextIndex === undefined) break

    const labelKey = labels[nextIndex]!.replace(/\s+/g, ' ').trim().toLowerCase()
    visited.add(labelKey)

    const jsonMark = harvestedJson.length
    const opened = await clickConversationRow(page, nextIndex)
    if (!opened) continue
    await page.waitForURL(/\/direct\/t\//, { timeout: 8_000 }).catch(() => undefined)
    await humanPause(1_200, 2_200)
    await dismissInboxPrompts(page)
    if (!page.url().includes('/direct/t/')) {
      logger.warn({ msg: 'Collector click did not open a thread', label: labels[nextIndex] })
      continue
    }
    items.push(...(await extractFromOpenThread(page, harvestedJson, jsonMark)))

    await page
      .goto('https://www.instagram.com/direct/inbox/', {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      })
      .catch(() => undefined)
    await humanPause(1_000, 1_800)
  }

  return items
}

async function listConversationLabels(page: Page): Promise<string[]> {
  return page
    .evaluate(() => {
      const seen = new Set<number>()
      const rows: { y: number; text: string }[] = []
      const nodes = document.querySelectorAll<HTMLElement>('[role="main"] *')
      for (const el of nodes) {
        const r = el.getBoundingClientRect()
        if (r.x < 0 || r.x > 520 || r.y < 48 || r.width < 80 || r.height < 56 || r.height > 110) continue
        const raw = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim()
        if (raw.length < 2 || raw.length > 800) continue
        if (/^(send message|your messages|search)$/i.test(raw)) continue
        if (!/new messages|unread|·\s*\d|[A-Za-z]{3,}/.test(raw)) continue
        const text = raw.slice(0, 800)
        const key = Math.round(r.y / 8)
        if (seen.has(key)) continue
        seen.add(key)
        rows.push({ y: r.y, text })
      }
      return rows.sort((a, b) => a.y - b.y).map((row) => row.text)
    })
    .catch(() => [])
}

async function clickConversationRow(page: Page, index: number): Promise<boolean> {
  return page
    .evaluate((i) => {
      const seen = new Set<number>()
      const rows: HTMLElement[] = []
      const nodes = document.querySelectorAll<HTMLElement>('[role="main"] *')
      for (const el of nodes) {
        const r = el.getBoundingClientRect()
        if (r.x < 0 || r.x > 520 || r.y < 48 || r.width < 80 || r.height < 56 || r.height > 110) continue
        const raw = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim()
        if (raw.length < 2 || raw.length > 800) continue
        if (/^(send message|your messages|search)$/i.test(raw)) continue
        if (!/new messages|unread|·\s*\d|[A-Za-z]{3,}/.test(raw)) continue
        const text = raw.slice(0, 800)
        const key = Math.round(r.y / 8)
        if (seen.has(key)) continue
        seen.add(key)
        rows.push(el)
      }
      rows.sort((a, b) => a.getBoundingClientRect().y - b.getBoundingClientRect().y)
      const row = rows[i]
      if (!row) return false
      row.click()
      return true
    }, index)
    .catch(() => false)
}

async function dismissInboxPrompts(page: Page): Promise<void> {
  for (let round = 0; round < 6; round++) {
    let dismissed = false
    const body = await page.locator('body').innerText().catch(() => '')

    if (/sleep mode|quiet mode|notifications will be muted/i.test(body)) {
      const okClicked = await clickSleepModeOk(page)
      if (okClicked) {
        dismissed = true
        await humanPause(500, 900)
      }
    }

    const sleepDialog = page
      .locator('[role="dialog"], [role="alertdialog"]')
      .filter({ hasText: /sleep mode|quiet mode|notifications will be muted/i })
      .first()
    if (await sleepDialog.isVisible({ timeout: 400 }).catch(() => false)) {
      const ok = sleepDialog.locator('button, [role="button"]').filter({ hasText: /^(OK|Got it)$/i }).first()
      if (await ok.isVisible({ timeout: 400 }).catch(() => false)) {
        await ok.click({ timeout: 2_000 }).catch(() => undefined)
        dismissed = true
        await humanPause(400, 800)
      }
    }

    const softDialog = page
      .locator('[role="dialog"], [role="alertdialog"]')
      .filter({
        hasText:
          /turn on notifications|save your login|better in the (instagram )?app|two-?step verification|two-?factor|add an extra layer/i,
      })
      .first()
    if (await softDialog.isVisible({ timeout: 400 }).catch(() => false)) {
      const dialogText = (await softDialog.innerText().catch(() => '')).toLowerCase()
      const hardChallenge = /enter the code|approve this login|checkpoint|suspicious login/.test(dialogText)
      if (!hardChallenge) {
        const skip = softDialog
          .locator('button, [role="button"]')
          .filter({ hasText: /not now|skip|dismiss|later|cancel/i })
          .first()
        if (await skip.isVisible({ timeout: 400 }).catch(() => false)) {
          await skip.click({ timeout: 2_000 }).catch(() => undefined)
          dismissed = true
          await humanPause(400, 800)
        }
      }
    }

    const prompts = [
      'button:has-text("Not Now")',
      'button:has-text("Not now")',
      'div[role="button"]:has-text("Not Now")',
      'button:has-text("Allow all cookies")',
      'button:has-text("Decline optional cookies")',
      '[role="dialog"] button:has-text("Dismiss")',
      '[role="dialog"] button:has-text("Got it")',
    ]
    for (const sel of prompts) {
      const loc = page.locator(sel).first()
      if (await loc.isVisible({ timeout: 350 }).catch(() => false)) {
        await loc.click({ timeout: 2_000 }).catch(() => undefined)
        dismissed = true
        await humanPause(300, 600)
      }
    }

    if (!dismissed) break
  }
}

async function clickSleepModeOk(page: Page): Promise<boolean> {
  const candidates = [
    page.getByRole('button', { name: /^OK$/i }).last(),
    page.locator('[role="button"]').filter({ hasText: /^OK$/i }).last(),
    page.getByText('OK', { exact: true }).last(),
  ]
  for (const loc of candidates) {
    if (await loc.isVisible({ timeout: 500 }).catch(() => false)) {
      await loc.click({ timeout: 2_500 }).catch(() => undefined)
      return true
    }
  }
  return false
}

async function logInboxGeometry(page: Page): Promise<void> {
  const stats = await page
    .evaluate(() => {
      const nodes = [...document.querySelectorAll('[role="main"] *')]
      const leftish = nodes.filter((el) => {
        const r = el.getBoundingClientRect()
        return r.x < 520 && r.width > 80 && r.height >= 40 && r.height <= 280 && r.y > 48
      })
      return {
        mainNodes: nodes.length,
        leftish: leftish.length,
        sampleHeights: leftish.slice(0, 12).map((el) => Math.round(el.getBoundingClientRect().height)),
      }
    })
    .catch(() => null)
  logger.info({ msg: 'Collector inbox geometry', ...stats })
}

async function logInboxDebug(page: Page): Promise<void> {
  const bodyPreview = (await page.innerText('body').catch(() => '')).replace(/\s+/g, ' ').slice(0, 400)
  logger.info({
    msg: 'Collector inbox debug',
    pageUrl: page.url(),
    title: await page.title().catch(() => ''),
    bodyPreview,
  })
}

async function extractFromOpenThread(
  page: Page,
  harvestedJson: string[],
  jsonMark: number,
): Promise<CollectedReel[]> {
  if (!page.url().includes('/direct/t/')) {
    logger.warn({ msg: 'Collector skipped non-thread page', pageUrl: page.url() })
    return []
  }

  const threadUrl = page.url()
  await dismissInboxPrompts(page)
  await scrollOpenThread(page)
  await dismissInboxPrompts(page)

  const cards = await listPreviewCards(page)
  const used = new Set<string>()
  const urlsInOrder: string[] = []
  const followingTexts: string[] = []
  const pendingExtras: string[] = []

  for (let i = 0; i < Math.min(cards.length, 20); i++) {
    await dismissInboxPrompts(page)
    const mark = harvestedJson.length
    const clicked = await clickPreviewAt(page, cards[i]!)
    if (clicked) {
      await humanPause(1_200, 2_400)
      await dismissInboxPrompts(page)
    }

    const overlayHref = await page
      .locator('a[href*="/reel/"], a[href*="/reels/"], a[href*="/p/"]')
      .first()
      .getAttribute('href')
      .catch(() => null)

    const found = uniqueUrls([
      ...extractInstagramReelUrls(page.url()),
      ...extractInstagramReelUrls(overlayHref ?? ''),
      ...extractInstagramReelUrls(harvestedJson.slice(mark).join('\n')),
    ]).filter((url) => !used.has(url) && !pendingExtras.includes(url))

    let assigned = found[0] ?? pendingExtras.shift()
    if (assigned) {
      used.add(assigned)
      urlsInOrder.push(assigned)
      followingTexts.push(cards[i]!.followingText)
      pendingExtras.push(...found.slice(assigned === found[0] ? 1 : 0))
    }

    if (!page.url().includes('/direct/')) {
      await page
        .goto(threadUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 })
        .catch(() => undefined)
      await humanPause(800, 1_400)
      await dismissInboxPrompts(page)
    } else {
      await page.keyboard.press('Escape').catch(() => undefined)
    }
  }

  if (urlsInOrder.length < cards.length) {
    const leftovers = (await collectUrls(page, harvestedJson, jsonMark)).filter((url) => !used.has(url))
    for (let i = urlsInOrder.length; i < cards.length && leftovers.length > 0; i++) {
      const url = leftovers.shift()!
      used.add(url)
      urlsInOrder.push(url)
      followingTexts.push(cards[i]?.followingText ?? '')
    }
  }

  if (urlsInOrder.length === 0) {
    const fallback = await collectUrls(page, harvestedJson, jsonMark)
    urlsInOrder.push(...fallback)
    while (followingTexts.length < urlsInOrder.length) followingTexts.push('')
  }

  const zipped = zipUrlsWithFollowingText(urlsInOrder, followingTexts)
  logger.info({
    msg: 'Collector thread extract',
    pageUrl: page.url(),
    urlCount: zipped.length,
    previewCount: cards.length,
    harvestChunks: harvestedJson.length - jsonMark,
    textPreview: followingTexts.join(' | ').replace(/\s+/g, ' ').slice(0, 240),
  })

  const sender =
    (await page
      .locator('header a[href^="/"]')
      .first()
      .innerText()
      .catch(() => '')) || null

  return zipped.map((row) => ({
    sourceUrl: row.sourceUrl,
    nearbyText: row.nearbyText,
    senderUsername: sender?.replace(/^@/, '').trim() || null,
    threadId: threadUrl,
  }))
}

async function collectUrls(
  page: Page,
  harvestedJson: string[],
  jsonMark: number,
): Promise<string[]> {
  const blob = await readThreadDomBlob(page)
  const reactBlob = await readReactMediaCodes(page)
  return uniqueUrls([
    ...extractInstagramReelUrls(harvestedJson.slice(jsonMark).join('\n')),
    ...extractInstagramReelUrls(blob),
    ...extractInstagramReelUrls(reactBlob),
    ...extractInstagramReelUrls(page.url()),
  ])
}

async function scrollOpenThread(page: Page): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await page
      .evaluate(() => {
        const w = window.innerWidth
        const panes = [...document.querySelectorAll<HTMLElement>('[role="main"] div')].filter((el) => {
          const r = el.getBoundingClientRect()
          return r.x > w * 0.38 && r.height > 180 && el.scrollHeight > el.clientHeight + 20
        })
        const pane = panes.sort((a, b) => b.clientHeight - a.clientHeight)[0]
        if (pane) pane.scrollTop = pane.scrollHeight
      })
      .catch(() => undefined)
    await humanPause(400, 800)
  }
}

type PreviewCard = { x: number; y: number; followingText: string }

async function listPreviewCards(page: Page): Promise<PreviewCard[]> {
  return page
    .evaluate(() => {
      const headerBottom = 110
      const w = window.innerWidth
      const divider = [...document.querySelectorAll('span, div')].find((el) => {
        const t = (el.textContent || '').replace(/\s+/g, ' ').trim()
        const r = el.getBoundingClientRect()
        return t === 'New messages' && r.x > w * 0.38 && r.width < w * 0.65
      })
      const dividerY = divider ? divider.getBoundingClientRect().bottom : 0
      const minY = dividerY > headerBottom ? dividerY : headerBottom

      const media = [...document.querySelectorAll<HTMLElement>('[role="main"] img, [role="main"] video')]
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter((x) => x.r.width >= 72 && x.r.height >= 72 && x.r.y > minY && x.r.x > w * 0.38)
        .sort((a, b) => a.r.y - b.r.y)

      const cards: { r: DOMRect }[] = []
      for (const item of media) {
        const last = cards[cards.length - 1]
        if (last && Math.abs(last.r.y - item.r.y) < 40) continue
        cards.push(item)
      }

      const mapped = cards.map((item, i) => {
        const nextY = cards[i + 1]?.r.y ?? item.r.bottom + 240
        const following: string[] = []
        document.querySelectorAll('[role="main"] span').forEach((el) => {
          const r = el.getBoundingClientRect()
          if (r.x < w * 0.38 || r.y < item.r.bottom - 4 || r.y >= nextY) return
          const t = (el.textContent || '').replace(/\s+/g, ' ').trim()
          if (t && t.length < 80 && t !== 'New messages') following.push(t)
        })
        return {
          x: item.r.x + item.r.width / 2,
          y: item.r.y + item.r.height / 2,
          followingText: [...new Set(following)].join('\n'),
        }
      })

      if (mapped.length === 0 && dividerY > 0) {
        return [...document.querySelectorAll<HTMLElement>('[role="main"] img, [role="main"] video')]
          .map((el) => {
            const r = el.getBoundingClientRect()
            return { x: r.x + r.width / 2, y: r.y + r.height / 2, followingText: '', w: r.width, h: r.height, top: r.y }
          })
          .filter((x) => x.w >= 72 && x.h >= 72 && x.top > headerBottom && x.x > w * 0.38)
          .sort((a, b) => a.y - b.y)
          .map(({ x, y, followingText }) => ({ x, y, followingText }))
      }
      return mapped
    })
    .catch(() => [])
}

async function clickPreviewAt(page: Page, card: PreviewCard): Promise<boolean> {
  await page.mouse.click(card.x, card.y)
  return true
}

async function readReactMediaCodes(page: Page): Promise<string> {
  return page
    .evaluate(() => {
      const codes: string[] = []
      const seenObj = new Set<object>()
      const visit = (val: unknown, depth: number) => {
        if (!val || depth > 10) return
        if (typeof val !== 'object') return
        if (seenObj.has(val as object)) return
        seenObj.add(val as object)
        const rec = val as Record<string, unknown>
        const code = rec.code
        const productType = rec.product_type
        const mediaType = rec.media_type
        if (
          typeof code === 'string' &&
          /^[A-Za-z0-9_-]{8,15}$/.test(code) &&
          (productType === 'clips' || mediaType === 2 || typeof rec.organic_tracking_token === 'string')
        ) {
          codes.push(`https://www.instagram.com/reel/${code}/`)
        }
        for (const key of Object.keys(rec)) {
          if (
            key.startsWith('__react') ||
            key === 'memoizedProps' ||
            key === 'pendingProps' ||
            key === 'child' ||
            key === 'sibling' ||
            key === 'return' ||
            key === 'props' ||
            key === 'stateNode'
          ) {
            visit(rec[key], depth + 1)
          }
        }
      }
      const w = window.innerWidth
      document.querySelectorAll('[role="main"] *').forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.x < w * 0.35) return
        const rec = el as unknown as Record<string, unknown>
        for (const key of Object.keys(rec)) {
          if (key.startsWith('__reactFiber') || key.startsWith('__reactProps')) visit(rec[key], 0)
        }
      })
      return codes.join('\n')
    })
    .catch(() => '')
}

async function readThreadDomBlob(page: Page): Promise<string> {
  return page
    .evaluate(() => {
      const root = document.querySelector('[role="main"]') || document.body
      const chunks: string[] = [location.href, root.innerHTML]
      root.querySelectorAll('*').forEach((el) => {
        for (const attr of el.attributes) chunks.push(attr.value)
      })
      return chunks.join('\n')
    })
    .catch(() => '')
}

function uniqueUrls(urls: string[]): string[] {
  return [...new Set(urls)]
}

function dedupeItems(items: CollectedReel[]): CollectedReel[] {
  const seen = new Set<string>()
  const out: CollectedReel[] = []
  for (const item of items) {
    if (seen.has(item.sourceUrl)) continue
    seen.add(item.sourceUrl)
    out.push(item)
  }
  return out
}
