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
  SEARCH_RESULTS_WAIT_MS,
  collectorSearchThreadId,
  isGlobalReelsFeedUrl,
  isSearchHarvestPage,
  isSearchResultReelHref,
  searchNicheShortfallMessage,
  type SearchNicheTarget,
} from './searchNiches'

export async function harvestSearchReels(
  page: Page,
  harvestedReelUrls: string[],
  known: Set<string>,
  used: Set<string>,
): Promise<CollectedReel[]> {
  const items: CollectedReel[] = []
  const failures: string[] = []
  // Sports, then anime, then memes. A shortfall is an error, not a skip.
  for (const target of COLLECTOR_SEARCH_TARGETS) {
    const found = await harvestOneSearchNiche(page, harvestedReelUrls, known, used, target)
    items.push(...found)
    logger.info({
      msg: 'Collector search niche done',
      slug: target.slug,
      query: target.query,
      taken: found.length,
      needed: SEARCH_REELS_PER_NICHE,
    })
    if (found.length < SEARCH_REELS_PER_NICHE) {
      const detail = searchNicheShortfallMessage(
        target.slug,
        target.query,
        found.length,
        SEARCH_REELS_PER_NICHE,
        page.url(),
      )
      logger.error({ msg: 'Collector search niche shortfall', detail, pageUrl: page.url() })
      failures.push(detail)
    }
  }
  if (failures.length > 0) {
    const err = new Error(failures.join(' | ')) as Error & { collectedItems: CollectedReel[] }
    err.collectedItems = items
    throw err
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
  await runKeywordSearch(page, target.query)

  // Tile hrefs are enough. Opening each reel used to leave us on /reel/
  // while the global Search box was still visible, so the next niche ran empty.
  for (let i = 0; i < MAX_SEARCH_CANDIDATES_PER_NICHE && taken.length < SEARCH_REELS_PER_NICHE; i++) {
    const hrefs = (await listSearchReelHrefs(page)).filter(
      (url) => !known.has(url) && !used.has(url) && !attempted.has(url),
    )
    if (hrefs.length === 0) {
      await waitForSearchReelTiles(page, SEARCH_REELS_PER_NICHE, 12_000)
      await page.mouse.wheel(0, randomInt(240, 480))
      await humanPause(1_200, 2_000)
      continue
    }

    for (const next of hrefs) {
      if (taken.length >= SEARCH_REELS_PER_NICHE) break
      attempted.add(next)
      const code = instagramShortcodeFromUrl(next)
      if (!code) continue
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
  }

  return taken
}

async function runKeywordSearch(page: Page, query: string): Promise<void> {
  const encoded = encodeURIComponent(query)
  const tag = encodeURIComponent(query.trim().replace(/^#/, '').replace(/\s+/g, ''))
  const urls = [
    `https://www.instagram.com/explore/search/keyword/?q=${encoded}`,
    `https://www.instagram.com/explore/tags/${tag}/`,
    `https://www.instagram.com/popular/${tag}/`,
  ]
  for (const url of urls) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => undefined)
    await humanPause(1_800, 2_800)
    await dismissSoftPrompts(page)
    if (isGlobalReelsFeedUrl(page.url())) {
      logger.error({ msg: 'Collector search hit the Reels feed', query, pageUrl: page.url() })
      continue
    }
    await clickReelsFilterInSearchMain(page)
    if (isGlobalReelsFeedUrl(page.url()) || !isSearchHarvestPage(page.url())) continue
    const hrefs = await waitForSearchReelTiles(page, SEARCH_REELS_PER_NICHE, SEARCH_RESULTS_WAIT_MS)
    if (hrefs.length >= SEARCH_REELS_PER_NICHE) {
      logger.info({
        msg: 'Collector search tiles ready',
        query,
        url,
        tileCount: hrefs.length,
      })
      return
    }
    logger.warn({
      msg: 'Collector search page still short of reel tiles after waiting',
      query,
      url,
      pageUrl: page.url(),
      tileCount: hrefs.length,
      needed: SEARCH_REELS_PER_NICHE,
      waitedMs: SEARCH_RESULTS_WAIT_MS,
    })
  }
  logger.error({ msg: 'Collector search never found reel tiles', query, pageUrl: page.url() })
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
      // Stay inside main so the left-nav Reels link never counts as a tile.
      return Array.from(
        g.document.querySelectorAll('main a[href*="/reel/"], main a[href*="/reels/"], main a[href*="/p/"]'),
      ).map((el) => el.href || el.getAttribute?.('href') || '')
    })
    .catch(() => [] as string[])
  return uniqueUrls(raw.flatMap((href) => extractInstagramReelUrls(href))).filter(isSearchResultReelHref)
}

async function waitForSearchReelTiles(
  page: Page,
  minCount: number,
  timeoutMs: number,
): Promise<string[]> {
  const deadline = Date.now() + timeoutMs
  let hrefs = await listSearchReelHrefs(page)
  while (Date.now() < deadline) {
    if (hrefs.length >= minCount) return hrefs
    await page
      .locator('main a[href*="/reel/"]')
      .first()
      .waitFor({ state: 'visible', timeout: 4_000 })
      .catch(() => undefined)
    hrefs = await listSearchReelHrefs(page)
    if (hrefs.length >= minCount) return hrefs
    await page.mouse.wheel(0, randomInt(200, 400))
    await humanPause(2_000, 3_200)
    hrefs = await listSearchReelHrefs(page)
  }
  return hrefs
}

async function clickReelsFilterInSearchMain(page: Page): Promise<void> {
  const tabs = page.locator('main [role="tab"], main a, main button').filter({ hasText: /^reels$/i })
  const count = await tabs.count().catch(() => 0)
  for (let i = 0; i < count; i++) {
    const tab = tabs.nth(i)
    if (!(await tab.isVisible({ timeout: 800 }).catch(() => false))) continue
    const href = (await tab.getAttribute('href').catch(() => null)) ?? ''
    if (href && isGlobalReelsFeedUrl(new URL(href, 'https://www.instagram.com').toString())) continue
    const clicked = await tab.click({ timeout: 4_000 }).then(() => true).catch(() => false)
    if (!clicked) continue
    await humanPause(2_000, 3_500)
    return
  }
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
