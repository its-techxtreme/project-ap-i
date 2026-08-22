import path from 'node:path'

import { extractInstagramReelUrls, pickNicheFromFollowingText, zipUrlsWithFollowingText } from '@project-api/shared'
import type { Page, Response } from 'playwright'

import { config } from '../config'
import { logger } from '../logging/logger'
import { detectLoginOrChallenge } from '../uploaders/loginChallengeDetection'
import { withAuthenticatedContext } from '../uploaders/playwrightContext'
import { humanPause } from '../uploaders/playwrightHumanBehavior'

import { parseCollectorThreadIds } from './collectorThreadIds'
import { orderConversationIndexes } from './conversationOrder'
import type { CollectedReel } from './persistCollectedReels'

const MAX_THREADS = 12
const MAX_REELS = 80
const MAX_REELS_PER_THREAD = 40

export { parseCollectorThreadIds } from './collectorThreadIds'

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
      const harvestedReelUrls: string[] = []
      const onRequestUrl = (req: { url: () => string }) => {
        harvestedReelUrls.push(...extractInstagramReelUrls(req.url()))
      }
      const onResponseUrl = (res: Response) => {
        harvestedReelUrls.push(...extractInstagramReelUrls(res.url()))
      }
      page.on('request', onRequestUrl)
      context.on('response', onResponseUrl)
      try {
        const items = await scrapeInboxPage(page, harvestedReelUrls)
        const unique = dedupeItems(items).slice(0, MAX_REELS)
        logger.info({ msg: 'Collector scrape finished', itemCount: unique.length })
        return { ok: true, items: unique, loginRequired: false }
      } finally {
        page.off('request', onRequestUrl)
        context.off('response', onResponseUrl)
      }
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.warn({ msg: 'Collector scrape failed', error: message })
    const loginRequired = /login|2fa|captcha|challenge|profile/i.test(message)
    return { ok: false, items: [], loginRequired, error: message }
  }
}

async function scrapeInboxPage(page: Page, harvestedReelUrls: string[]): Promise<CollectedReel[]> {
  await page.goto('https://www.instagram.com/direct/inbox/', {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  })
  await humanPause(2_000, 4_000)
  await dismissInboxPrompts(page)

  const challenge = await detectLoginOrChallenge(page)
  if (challenge.loginRequired) {
    throw new Error(challenge.reason ?? challenge.challengeType ?? 'login_required')
  }

  const items: CollectedReel[] = []
  const threadIds = parseCollectorThreadIds(config.COLLECTOR_THREAD_IDS)
  logger.info({
    msg: 'Collector configured threads',
    threadCount: threadIds.length,
    priorityChat: config.COLLECTOR_PRIORITY_CHAT || null,
  })

  for (const threadId of threadIds) {
    if (items.length >= MAX_REELS) break
    const mark = harvestedReelUrls.length
    const opened = await openDirectThread(page, threadId)
    if (!opened) continue
    items.push(...(await extractFromOpenThread(page, harvestedReelUrls, mark)))
  }

  if (threadIds.length === 0) {
    items.push(...(await scrapeInboxByConversationList(page, harvestedReelUrls, items.length)))
  }

  return items
}

async function openDirectThread(page: Page, threadId: string): Promise<boolean> {
  const url = `https://www.instagram.com/direct/t/${threadId}/`
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => undefined)
  await humanPause(1_500, 2_800)
  await dismissInboxPrompts(page)
  const challenge = await detectLoginOrChallenge(page)
  if (challenge.loginRequired) {
    throw new Error(challenge.reason ?? challenge.challengeType ?? 'login_required')
  }
  if (!page.url().includes('/direct/t/')) {
    logger.warn({ msg: 'Collector thread did not open', threadId, pageUrl: page.url() })
    return false
  }
  return true
}

async function scrapeInboxByConversationList(
  page: Page,
  harvestedReelUrls: string[],
  already: number,
): Promise<CollectedReel[]> {
  const items: CollectedReel[] = []
  const visited = new Set<string>()

  for (let pass = 0; pass < MAX_THREADS; pass++) {
    if (already + items.length >= MAX_REELS) break
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

    const jsonMark = harvestedReelUrls.length
    const opened = await clickConversationRow(page, nextIndex)
    if (!opened) continue
    await page.waitForURL(/\/direct\/t\//, { timeout: 8_000 }).catch(() => undefined)
    await humanPause(1_200, 2_200)
    await dismissInboxPrompts(page)
    if (!page.url().includes('/direct/t/')) {
      logger.warn({ msg: 'Collector click did not open a thread', label: labels[nextIndex] })
      continue
    }
    items.push(...(await extractFromOpenThread(page, harvestedReelUrls, jsonMark)))

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
  return page.evaluate(inboxConversationRowsScript).then((rows) => rows.map((row) => row.text)).catch(() => [])
}

async function clickConversationRow(page: Page, index: number): Promise<boolean> {
  const point = await page.evaluate(inboxConversationRowsScript).then((rows) => rows[index] ?? null).catch(() => null)
  if (!point) return false
  await page.mouse.click(point.x, point.y)
  return true
}

function inboxConversationRowsScript(): { x: number; y: number; text: string }[] {
  const doc = (globalThis as unknown as { document: { querySelectorAll: (s: string) => ArrayLike<EvalNode> } }).document
  const seen = new Map<number, { x: number; y: number; width: number; text: string }>()
  const nodes = Array.from(doc.querySelectorAll('[role="main"] *'))
  for (const el of nodes) {
    const r = el.getBoundingClientRect()
    if (r.x < 0 || r.x > 480 || r.y < 48 || r.width < 180 || r.height < 56 || r.height > 110) continue
    const raw = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim()
    if (/^(send message|your messages|search)$/i.test(raw)) continue
    const key = Math.round(r.y / 8)
    const prev = seen.get(key)
    if (prev && prev.width >= r.width) continue
    seen.set(key, {
      x: r.x + Math.min(120, r.width / 3),
      y: r.y + r.height / 2,
      width: r.width,
      text: raw.slice(0, 800) || `chat-${key}`,
    })
  }
  return [...seen.values()]
    .sort((a, b) => a.y - b.y)
    .map(({ x, y, text }) => ({ x, y, text }))
}

type EvalNode = {
  innerText?: string
  textContent?: string | null
  getBoundingClientRect: () => {
    x: number
    y: number
    width: number
    height: number
    bottom: number
  }
  tagName?: string
  href?: string
  getAttribute?: (name: string) => string | null
  querySelector?: (selector: string) => EvalNode | null
  parentElement?: EvalNode | null
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
      const doc = (globalThis as unknown as { document: { querySelectorAll: (s: string) => ArrayLike<EvalNode> } }).document
      const nodes = Array.from(doc.querySelectorAll('[role="main"] *'))
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
  harvestedReelUrls: string[],
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

  const used = new Set<string>()
  const urlsInOrder: string[] = []
  const followingTexts: string[] = []
  const pendingExtras: string[] = []
  const attempted = new Set<string>()
  let staleRounds = 0

  for (let round = 0; round < 40 && urlsInOrder.length < MAX_REELS_PER_THREAD; round++) {
    await dismissInboxPrompts(page)
    const before = urlsInOrder.length
    await harvestVisibleCards(page, {
      threadUrl,
      harvestedReelUrls,
      used,
      urlsInOrder,
      followingTexts,
      pendingExtras,
      attempted,
    })
    if (urlsInOrder.length === before) staleRounds += 1
    else staleRounds = 0

    await scrollThreadOlder(page)
    await humanPause(700, 1_200)
    if (staleRounds >= 8) break
  }

  const zipped = zipUrlsWithFollowingText(urlsInOrder, followingTexts)
  logger.info({
    msg: 'Collector thread extract',
    pageUrl: page.url(),
    urlCount: zipped.length,
    harvestChunks: harvestedReelUrls.length - jsonMark,
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

async function harvestVisibleCards(
  page: Page,
  state: {
    threadUrl: string
    harvestedReelUrls: string[]
    used: Set<string>
    urlsInOrder: string[]
    followingTexts: string[]
    pendingExtras: string[]
    attempted: Set<string>
  },
): Promise<void> {
  const cards = await listPreviewCards(page)

  for (const card of cards) {
    if (state.urlsInOrder.length >= MAX_REELS_PER_THREAD) break
    const fromCardHref = extractInstagramReelUrls(card.href)[0]
    const fingerprint = `${Math.round(card.x / 10)}:${Math.round(card.y / 10)}`
    if (fromCardHref && state.used.has(fromCardHref)) continue
    if (!fromCardHref && state.attempted.has(fingerprint)) continue

    const mark = state.harvestedReelUrls.length
    let assigned = fromCardHref && !state.used.has(fromCardHref) ? fromCardHref : undefined
    if (!assigned) {
      await clickPreviewAt(page, card)
      assigned =
        (await waitForReelPermalink(
          page,
          state.harvestedReelUrls,
          mark,
          state.used,
          state.pendingExtras,
        )) ?? undefined
    }

    state.attempted.add(fingerprint)
    if (assigned && !state.used.has(assigned)) {
      state.used.add(assigned)
      state.urlsInOrder.push(assigned)
      state.followingTexts.push(card.followingText)
    }

    if (!page.url().includes('/direct/')) {
      await page
        .goto(state.threadUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 })
        .catch(() => undefined)
      await humanPause(800, 1_400)
      await dismissInboxPrompts(page)
    } else {
      await page.keyboard.press('Escape').catch(() => undefined)
    }
  }
}

async function waitForReelPermalink(
  page: Page,
  harvestedReelUrls: string[],
  mark: number,
  used: Set<string>,
  pendingExtras: string[],
): Promise<string | null> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const found = uniqueUrls(harvestedReelUrls.slice(mark)).filter(
      (url) => !used.has(url) && !pendingExtras.includes(url),
    )

    if (found[0]) {
      pendingExtras.push(...found.slice(1))
      return found[0]
    }

    const fromPage = uniqueUrls(extractInstagramReelUrls(page.url())).filter(
      (url) => !used.has(url) && !pendingExtras.includes(url),
    )
    if (fromPage[0]) return fromPage[0]
    await humanPause(250, 450)
  }
  return pendingExtras.shift() ?? null
}

async function scrollThreadOlder(page: Page): Promise<boolean> {
  const moved = await page
    .evaluate(() => {
      const g = globalThis as unknown as {
        innerWidth: number
        innerHeight: number
        document: {
          elementFromPoint: (x: number, y: number) => {
            scrollHeight: number
            clientHeight: number
            scrollTop: number
            parentElement: unknown
          } | null
        }
      }
      const x = Math.round(g.innerWidth * 0.48)
      const y = Math.round(g.innerHeight * 0.58)
      let el = g.document.elementFromPoint(x, y)
      let changed = false
      for (let hop = 0; hop < 14 && el; hop++) {
        if (el.scrollHeight > el.clientHeight + 20) {
          const before = el.scrollTop
          el.scrollTop = Math.max(0, el.scrollTop - Math.max(200, el.clientHeight * 0.75))
          if (el.scrollTop < before - 4) changed = true
        }
        el = el.parentElement as typeof el
      }
      return changed
    })
    .catch(() => false)
  const target = await page
    .evaluate(() => {
      const g = globalThis as unknown as { innerWidth: number; innerHeight: number }
      return { x: Math.round(g.innerWidth * 0.48), y: Math.round(g.innerHeight * 0.58) }
    })
    .catch(() => ({ x: 380, y: 420 }))
  await page.mouse.move(target.x, target.y)
  await page.mouse.wheel(0, -1600)
  await page.keyboard.press('PageUp').catch(() => undefined)
  return Boolean(moved)
}

async function scrollOpenThread(page: Page): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await page
      .evaluate(() => {
        const g = globalThis as unknown as {
          innerWidth: number
          document: { querySelectorAll: (s: string) => ArrayLike<EvalNode & { clientHeight: number; scrollHeight: number; scrollTop: number }> }
        }
        const w = g.innerWidth
        const minX = Math.min(320, Math.max(48, w * 0.22))
        const panes = Array.from(g.document.querySelectorAll('[role="main"] div')).filter((el) => {
          const r = el.getBoundingClientRect()
          return r.x > minX && r.height > 180 && el.scrollHeight > el.clientHeight + 20
        })
        const pane = panes.sort((a, b) => b.clientHeight - a.clientHeight)[0]
        if (pane) pane.scrollTop = pane.scrollHeight
      })
      .catch(() => undefined)
    await humanPause(400, 800)
  }
}

type PreviewCard = { x: number; y: number; followingText: string; href: string }

async function listPreviewCards(page: Page): Promise<PreviewCard[]> {
  const scanned = await page
    .evaluate(() => {
      const g = globalThis as unknown as {
        innerWidth: number
        document: {
          querySelectorAll: (s: string) => ArrayLike<{
            innerText?: string
            textContent?: string | null
            tagName?: string
            href?: string
            parentElement?: unknown
            getAttribute?: (name: string) => string | null
            querySelector?: (selector: string) => {
              href?: string
              getAttribute?: (name: string) => string | null
            } | null
            getBoundingClientRect: () => {
              x: number
              y: number
              width: number
              height: number
              bottom: number
            }
          }>
        }
      }
      const headerBottom = 110
      const w = g.innerWidth
      const minX = Math.min(320, Math.max(48, w * 0.22))
      const minY = headerBottom

      const mediaAll = Array.from(g.document.querySelectorAll('[role="main"] img, [role="main"] video'))
      const mediaSized = mediaAll.filter((el) => {
        const r = el.getBoundingClientRect()
        return r.width >= 56 && r.height >= 56 && r.y > minY
      })
      const media = mediaSized
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter((x) => x.r.width >= 70 && x.r.height >= 70 && x.r.x > 160)
        .sort((a, b) => a.r.y - b.r.y)

      const cards: typeof media = []
      for (const item of media) {
        const last = cards[cards.length - 1]
        if (last && Math.abs(last.r.y - item.r.y) < 40) continue
        cards.push(item)
      }

      const mapped = cards.map((item, i) => {
        const nextY = cards[i + 1]?.r.y ?? item.r.bottom + 160
        const following: string[] = []
        Array.from(g.document.querySelectorAll('[role="main"] span, [role="main"] [dir="auto"]')).forEach((el) => {
          const r = el.getBoundingClientRect()
          if (r.x < 160 || r.y < item.r.bottom - 4 || r.y >= nextY) return
          if (r.height > 48) return
          const t = (el.textContent || '').replace(/\s+/g, ' ').trim()
          if (!t || t.length > 48) return
          if (/^(like|reply|seen|sent|new messages|you sent a reel|sent a reel|watch more|instagram)$/i.test(t)) return
          following.push(t)
        })
        let href = ''
        let cur: {
          tagName?: string
          href?: string
          parentElement?: unknown
          getAttribute?: (name: string) => string | null
          querySelector?: (selector: string) => { href?: string; getAttribute?: (name: string) => string | null } | null
        } | null = item.el
        for (let walk = 0; walk < 12 && cur && !href; walk++) {
          if ((cur.tagName || '').toUpperCase() === 'A') {
            const candidate = cur.href || cur.getAttribute?.('href') || ''
            if (/\/(?:reel|reels|p)\//i.test(candidate)) href = candidate
          }
          const nested = cur.querySelector?.('a[href*="/reel/"], a[href*="/reels/"], a[href*="/p/"]') ?? null
          if (!href && nested) href = nested.href || nested.getAttribute?.('href') || ''
          cur = (cur.parentElement as typeof cur) ?? null
        }
        return {
          x: item.r.x + item.r.width / 2,
          y: item.r.y + item.r.height / 2,
          followingText: [...new Set(following)].join('\n'),
          href,
        }
      })

      const paneHrefs = Array.from(
        g.document.querySelectorAll('a[href*="/reel/"], a[href*="/reels/"], a[href*="/p/"]'),
      )
        .map((el) => {
          const r = el.getBoundingClientRect()
          const following: string[] = []
          const nextY = r.bottom + 140
          Array.from(g.document.querySelectorAll('[role="main"] span, [role="main"] [dir="auto"]')).forEach((node) => {
            const nr = node.getBoundingClientRect()
            if (nr.x < 160 || nr.y < r.bottom - 4 || nr.y >= nextY) return
            if (nr.height > 48) return
            const t = (node.textContent || '').replace(/\s+/g, ' ').trim()
            if (!t || t.length > 48) return
            if (/^(like|reply|seen|sent|new messages|you sent a reel|sent a reel|watch more|instagram)$/i.test(t)) return
            following.push(t)
          })
          return {
            href: el.href || el.getAttribute?.('href') || '',
            x: r.x,
            y: r.y,
            followingText: [...new Set(following)].join('\n'),
          }
        })
        .filter((x) => x.href && x.y > minY && x.x > 160)

      return {
        cards: mapped,
        paneHrefs,
        debug: {
          w,
          minX,
          mediaAll: mediaAll.length,
          mediaSized: mediaSized.length,
          mediaInPane: media.length,
          cardCount: mapped.length,
          paneHrefCount: paneHrefs.length,
          sample: mediaSized.slice(0, 8).map((el) => {
            const r = el.getBoundingClientRect()
            return {
              x: Math.round(r.x),
              y: Math.round(r.y),
              w: Math.round(r.width),
              h: Math.round(r.height),
            }
          }),
        },
      }
    })
    .catch((err: unknown) => {
      logger.warn({
        msg: 'Collector preview scan failed',
        error: err instanceof Error ? err.message : String(err),
      })
      return null
    })

  if (!scanned) return []
  logger.info({ msg: 'Collector preview scan', ...scanned.debug })

  const merged: PreviewCard[] = [...scanned.cards]
  for (const item of scanned.paneHrefs) {
    const href = item.href
    if (!href) continue
    if (merged.some((card) => card.href === href)) continue
    merged.push({
      x: item.x + 40,
      y: item.y + 40,
      followingText: item.followingText ?? '',
      href,
    })
  }
  merged.sort((a, b) => a.y - b.y)
  return merged
}

async function clickPreviewAt(page: Page, card: PreviewCard): Promise<boolean> {
  await page.mouse.click(card.x, card.y)
  return true
}

function uniqueUrls(urls: string[]): string[] {
  return [...new Set(urls)]
}

function dedupeItems(items: CollectedReel[]): CollectedReel[] {
  const byUrl = new Map<string, CollectedReel>()
  for (const item of items) {
    const prev = byUrl.get(item.sourceUrl)
    if (!prev) {
      byUrl.set(item.sourceUrl, item)
      continue
    }
    const prevHas = Boolean(pickNicheFromFollowingText(prev.nearbyText))
    const nextHas = Boolean(pickNicheFromFollowingText(item.nearbyText))
    if (nextHas && !prevHas) byUrl.set(item.sourceUrl, item)
  }
  return [...byUrl.values()]
}
