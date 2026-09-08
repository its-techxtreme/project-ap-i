import { describe, expect, it } from 'vitest'

import {
  COLLECTOR_SEARCH_TARGETS,
  SEARCH_REELS_PER_NICHE,
  collectorSearchThreadId,
  isCollectorSearchOrigin,
  isGlobalReelsFeedUrl,
  isSearchHarvestPage,
  isSearchResultReelHref,
} from '../src/collector/searchNiches'

describe('collector search niches', () => {
  it('covers sports, anime, and memes in that order', () => {
    expect(COLLECTOR_SEARCH_TARGETS.map((t) => t.slug)).toEqual(['sports', 'anime', 'memes'])
    expect(SEARCH_REELS_PER_NICHE).toBe(3)
  })

  it('tags search origin so persist can queue without a DM thread', () => {
    expect(collectorSearchThreadId('sports')).toBe('collector:search:sports')
    expect(isCollectorSearchOrigin('collector:search:anime')).toBe(true)
    expect(isCollectorSearchOrigin('https://www.instagram.com/direct/t/17842064415169224/')).toBe(
      false,
    )
  })

  it('does not treat the left-nav Reels feed as a search result', () => {
    expect(isGlobalReelsFeedUrl('https://www.instagram.com/reels/')).toBe(true)
    expect(isGlobalReelsFeedUrl('https://www.instagram.com/reels')).toBe(true)
    expect(isSearchResultReelHref('https://www.instagram.com/reels/')).toBe(false)
    expect(isSearchHarvestPage('https://www.instagram.com/reels/')).toBe(false)
  })

  it('accepts explore search, tags, and popular pages plus real reel hrefs', () => {
    expect(isSearchHarvestPage('https://www.instagram.com/explore/search/keyword/?q=sport')).toBe(
      true,
    )
    expect(isSearchHarvestPage('https://www.instagram.com/explore/tags/anime/')).toBe(true)
    expect(isSearchResultReelHref('https://www.instagram.com/reel/AbC123xyzAB/')).toBe(true)
  })
})
