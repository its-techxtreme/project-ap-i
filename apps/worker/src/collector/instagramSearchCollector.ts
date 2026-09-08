import {
  extractInstagramReelUrls,
  instagramShortcodeFromUrl,
} from '@project-api/shared'
import type { Page } from 'playwright'

import { logger } from '../logging/logger'
import { humanPause, randomInt } from '../uploaders/playwrightHumanBehavior'

import type { CollectedReel } from './persistCollectedReels'
import {
  COLLECTOR_SEARCH_TARGETS,
  MAX_SEARCH_CANDIDATES_PER_NICHE,
  SEARCH_REELS_PER_NICHE,
  collectorSearchThreadId,
  isGlobalReelsFeedUrl,
  isSearchHarvestPage,
  isSearchResultReelHref,
  type SearchNicheTarget,
} from './searchNiches'

export async function harvestSearchReels(
  page: Page,
  harvestedReelUrls: string[],
  known: Set<string>,
  used: Set<string>,
): Promise<CollectedReel[]> {
  const items: CollectedReel[] = []
  for (const target of COLLECTOR_SEARCH_TARGETS) {
    const found = await harvestOneSearchNiche(page, harvestedReelUrls, known, used, target)
    items.push(...found)
    if (found.length === 0) {
      logger.warn({
        msg: 'Collector search found no reels for niche',
        slug: target.slug,
        query: target.query,
      })
    }
    logger.info({
      msg: 'Collector search niche done',
      slug: target.slug,
      query: target.query,
      taken: found.length,
    })
  }
  return items
}

async function harvestOneSearchNiche(
  page: Page,
  _harvestedReelUrls: string[],
  known: Set<string>,
  used: Set<string>,
  target: SearchNicheTarget,
): Promise<CollectedReel[]> {
  const taken: CollectedReel[] = []
  const attempted = new Set<string>()
  const opened = await openSearchReels(page, target.query)
  if (!opened) return taken

  for (let i = 0; i < MAX_SEARCH_CANDIDATES_PER_NICHE && taken.length < SEARCH_REELS_PER_NICHE; i++) {
    if (!isSearchHarvestPage(page.url()) || isGlobalReelsFeedUrl(page.url())) {
      logger.warn({
        msg: 'Collector search left the results page — stopping this niche',
        slug: target.slug,
        pageUrl: page.url(),
      })
      break
    }

    const hrefs = (await listSearchReelHrefs(page)).filter(
      (url) => !known.has(url) && !used.has(url) && !attempted.has(url),
    )
    const next = hrefs[0]
    if (!next) {
      await page.mouse.wheel(0, randomInt(240, 480))
      await humanPause(500, 900)
      continue
    }
    attempted.add(next)

    const code = instagramShortcodeFromUrl(next)
    if (!code) continue
    const tile = page.locator(`a[href*="/reel/${code}"], a[href*="/reels/${code}"], a[href*="/p/${code}"]`).first()
    if (!(await tile.isVisible({ timeout: 2_000 }).catch(() => false))) continue

    const resultsUrl = page.url()
    await tile.click({ timeout: 8_000 }).catch(() => undefined)
    await page.waitForURL(/\/(reel|reels|p)\/[A-Za-z0-9_-]{11}/i, { timeout: 8_000 }).catch(() => undefined)
    await humanPause(400, 800)

    const openedCode = instagramShortcodeFromUrl(page.url())
    const stillOnResults = isSearchHarvestPage(page.url()) && !openedCode
    const matchedTile = openedCode === code
    const landedOnFeed = isGlobalReelsFeedUrl(page.url())
    await page.goto(resultsUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => undefined)
    await humanPause(500, 900)
    await dismissSoftPrompts(page)

    if (landedOnFeed || (!matchedTile && !stillOnResults)) continue
    const assigned = `https://www.instagram.com/reel/${code}/`
    if (known.has(assigned) || used.has(assigned)) continue
    used.add(assigned)
    known.add(assigned)
    taken.push({
      sourceUrl: assigned,
      nearbyText: target.nearbyText,
      senderUsername: 'instagram-search',
      threadId: collectorSearchThreadId(target.slug),
    })
  }

  return taken
}

async function openSearchReels(page: Page, query: string): Promise<boolean> {
  await dismissSoftPrompts(page)
  const encoded = encodeURIComponent(query)

  await page
    .goto(`https://www.instagram.com/explore/search/keyword/?q=${encoded}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })
    .catch(() => undefined)
  await humanPause(800, 1_400)
  await dismissSoftPrompts(page)
  if (isGlobalReelsFeedUrl(page.url())) return false
  await clickReelsFilterInSearchMain(page)
  if (isGlobalReelsFeedUrl(page.url())) {
    logger.warn({ msg: 'Collector search hit the Reels feed, backing off', query, pageUrl: page.url() })
    return false
  }
  if (isSearchHarvestPage(page.url()) && (await listSearchReelHrefs(page)).length > 0) return true

  const tag = encodeURIComponent(query.trim().replace(/^#/, '').replace(/\s+/g, ''))
  await page
    .goto(`https://www.instagram.com/explore/tags/${tag}/`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })
    .catch(() => undefined)
  await humanPause(800, 1_400)
  await dismissSoftPrompts(page)
  await clickReelsFilterInSearchMain(page)
  if (isGlobalReelsFeedUrl(page.url())) {
    logger.warn({ msg: 'Collector search hit the Reels feed, backing off', query, pageUrl: page.url() })
    return false
  }

  if (isSearchHarvestPage(page.url()) && (await listSearchReelHrefs(page)).length > 0) return true

  await page
    .goto(`https://www.instagram.com/popular/${tag}/`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })
    .catch(() => undefined)
  await humanPause(800, 1_400)
  await dismissSoftPrompts(page)
  if (isGlobalReelsFeedUrl(page.url()) || !isSearchHarvestPage(page.url())) {
    logger.warn({
      msg: 'Collector search never reached a results page',
      query,
      pageUrl: page.url(),
    })
    return false
  }
  return (await listSearchReelHrefs(page)).length > 0
}

async function clickReelsFilterInSearchMain(page: Page): Promise<void> {
  const main = page.locator('main')
  const tabs = main.locator('[role="tab"], a, button').filter({ hasText: /^reels$/i })
  const count = await tabs.count().catch(() => 0)
  for (let i = 0; i < count; i++) {
    const tab = tabs.nth(i)
    if (!(await tab.isVisible({ timeout: 800 }).catch(() => false))) continue
    const href = (await tab.getAttribute('href').catch(() => null)) ?? ''
    if (href && isGlobalReelsFeedUrl(new URL(href, 'https://www.instagram.com').toString())) continue
    await tab.click({ timeout: 4_000 }).catch(() => undefined)
    await humanPause(700, 1_200)
    return
  }
}

async function listSearchReelHrefs(page: Page): Promise<string[]> {
  if (!isSearchHarvestPage(page.url()) || isGlobalReelsFeedUrl(page.url())) return []
  const raw = await page
    .evaluate(() => {
      const g = globalThis as unknown as {
        document: {
          querySelectorAll: (s: string) => ArrayLike<{ href?: string; getAttribute?: (n: string) => string | null }>
        }
      }
      return Array.from(g.document.querySelectorAll('main a[href*="/reel/"], main a[href*="/reels/"], main a[href*="/p/"]')).map(
        (el) => el.href || el.getAttribute?.('href') || '',
      )
    })
    .catch(() => [] as string[])
  return uniqueUrls(raw.flatMap((href) => extractInstagramReelUrls(href))).filter(isSearchResultReelHref)
}

async function dismissSoftPrompts(page: Page): Promise<void> {
  const skip = page.getByRole('button', { name: /not now|skip|dismiss/i }).first()
  if (await skip.isVisible({ timeout: 800 }).catch(() => false)) {
    await skip.click({ timeout: 2_000 }).catch(() => undefined)
  }
}

function uniqueUrls(urls: string[]): string[] {
  return [...new Set(urls)]
}
