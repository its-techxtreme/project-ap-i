import { instagramShortcodeFromUrl } from '@project-api/shared'
import type { NicheSlug } from '@project-api/shared'

export const SEARCH_REELS_PER_NICHE = 3
export const MAX_SEARCH_CANDIDATES_PER_NICHE = 40
export const SEARCH_RESULTS_WAIT_MS = 60_000

export type SearchNicheTarget = {
  slug: NicheSlug
  query: string
  nearbyText: string
}

/** Search tab queries, in run order. */
export const COLLECTOR_SEARCH_TARGETS: SearchNicheTarget[] = [
  { slug: 'sports', query: 'sport', nearbyText: 'Sports' },
  { slug: 'anime', query: 'anime', nearbyText: 'Anime' },
  { slug: 'memes', query: 'memes', nearbyText: 'Memes' },
]

export function collectorSearchThreadId(slug: NicheSlug): string {
  return `collector:search:${slug}`
}

export function isCollectorSearchOrigin(threadId: string | null | undefined): boolean {
  return typeof threadId === 'string' && /^collector:search:(memes|anime|sports)$/.test(threadId)
}

/** Left-nav Reels. No shortcode = the random feed, not a search hit. */
export function isGlobalReelsFeedUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, '') || '/'
    return path === '/reels'
  } catch {
    return false
  }
}

export function isSearchHarvestPage(url: string): boolean {
  try {
    const path = new URL(url).pathname
    return (
      path.includes('/explore/search/') ||
      path.includes('/explore/tags/') ||
      path.startsWith('/popular/')
    )
  } catch {
    return false
  }
}

export function isSearchResultReelHref(href: string): boolean {
  if (!href || isGlobalReelsFeedUrl(href)) return false
  return Boolean(instagramShortcodeFromUrl(href))
}

export function searchNicheShortfallMessage(
  slug: string,
  query: string,
  taken: number,
  needed: number,
  pageUrl: string,
): string {
  return `Collector search failed for ${slug} (query "${query}"): needed ${needed} unique reels, got ${taken}. Page: ${pageUrl}`
}
