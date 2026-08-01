import { describe, expect, it } from 'vitest'

import { getFallbackMetadata } from '../src/metadata/fallbacks'
import {
  assertMetadataQuality,
  hasPipelineBoilerplate,
  hasSpammyRepetition,
} from '../src/metadata/quality'
import {
  extractContentHook,
  filterSourceForNiche,
  isJunkSourceText,
  isWeakSourceHook,
} from '../src/metadata/sourceRelevance'

const CBSE_CAPTION = `Share this to your friends

CBSE OSM system has failed 17 lakh students. Evaluators warned about blurry answer sheets and server crashes in March but were told to stay silent. Teachers were threatened with disciplinary action for speaking up. Now the same teachers are being pressured to post positive messages. A Class 12 student named Sarthak investigated the tender process and found eligibility criteria were changed three times until only one company qualified.

#reels #cbse #osm #protest #dharmendrapradhan

This reel is fair comment on a matter of public interest.`

describe('getFallbackMetadata length floors', () => {
  for (const niche of ['memes', 'anime', 'sports'] as const) {
    it(`${niche} fallback passes assertMetadataQuality`, () => {
      const meta = getFallbackMetadata(niche, {
        title: 'Sample clip title for testing',
        description: 'A short source description about the clip mood and timing.',
        sourceUrl: 'https://youtube.com/shorts/abc',
        sourcePlatform: 'youtube',
      })
      expect(() =>
        assertMetadataQuality(
          {
            youtubeTitle: meta.youtubeTitle,
            youtubeDescription: meta.youtubeDescription,
            instagramCaption: meta.instagramCaption,
            keywords: [],
            instagramHashtags: [],
            youtubeHashtags: [],
          },
          niche,
        ),
      ).not.toThrow()
      expect(hasSpammyRepetition(meta.youtubeDescription)).toBe(false)
      expect(hasPipelineBoilerplate(meta.youtubeDescription)).toBe(false)
    })
  }

  it('works with empty source (template path)', () => {
    const meta = getFallbackMetadata('anime')
    expect(meta.youtubeDescription.length).toBeGreaterThanOrEqual(750)
    expect(meta.instagramCaption.length).toBeGreaterThanOrEqual(420)
    expect(meta.youtubeTitle.length).toBeGreaterThanOrEqual(40)
    expect(hasSpammyRepetition(meta.youtubeDescription)).toBe(false)
    expect(hasPipelineBoilerplate(meta.youtubeDescription)).toBe(false)
  })

  it('does not use unrelated Japanese gossip as title', () => {
    const gossip =
      '今夜、@thvはハリウッドで行われた @gracieabrams と @dojacat のパフォーマンスを観客席から鑑賞しました。'
    const meta = getFallbackMetadata('anime', {
      title: gossip,
      description: gossip,
      sourceUrl: 'https://www.instagram.com/reel/abc/',
      sourcePlatform: 'instagram',
    })
    expect(meta.youtubeTitle.includes('@thv')).toBe(false)
    expect(meta.youtubeTitle.toLowerCase()).toMatch(/anime/)
  })

  it('uses CBSE caption subject instead of Video by username + pipeline fluff', () => {
    const meta = getFallbackMetadata('memes', {
      title: 'Video by nav_neeti_',
      description: CBSE_CAPTION,
      sourceUrl: 'https://www.instagram.com/reel/DY9-Gahzn1F/',
      sourcePlatform: 'instagram',
    })
    expect(meta.youtubeTitle.toLowerCase()).not.toMatch(/^video by/)
    expect(meta.youtubeTitle.toLowerCase()).toMatch(/cbse|student|failed|osm/)
    expect(meta.youtubeDescription.toLowerCase()).toMatch(/cbse/)
    expect(meta.youtubeDescription.toLowerCase()).not.toMatch(/publishing lane/)
    expect(meta.youtubeDescription.toLowerCase()).not.toMatch(/originally submitted/)
    expect(meta.youtubeDescription.toLowerCase()).not.toMatch(/clip hook from the source/)
    expect(meta.youtubeDescription.toLowerCase()).not.toMatch(/metadata stays conservative/)
    expect(hasPipelineBoilerplate(meta.youtubeDescription)).toBe(false)
    expect(() =>
      assertMetadataQuality(
        {
          youtubeTitle: meta.youtubeTitle,
          youtubeDescription: meta.youtubeDescription,
          instagramCaption: meta.instagramCaption,
          keywords: [],
          instagramHashtags: [],
          youtubeHashtags: [],
        },
        'memes',
      ),
    ).not.toThrow()
  })
})

describe('sourceRelevance', () => {
  it('flags multi-mention gossip as junk', () => {
    expect(
      isJunkSourceText(
        '今夜、@thvはハリウッドで行われた @gracieabrams と @dojacat のパフォーマンスを観客席から鑑賞しました。',
      ),
    ).toBe(true)
  })

  it('flags Video by username as weak', () => {
    expect(isWeakSourceHook('Video by nav_neeti_')).toBe(true)
  })

  it('keeps short English hooks', () => {
    const filtered = filterSourceForNiche('anime', {
      title: 'When mc shows his power',
      description: 'When mc shows his power',
    })
    expect(filtered.usedSource).toBe(true)
    expect(filtered.title).toMatch(/power/i)
  })

  it('keeps long captions even without meme keywords', () => {
    const filtered = filterSourceForNiche('memes', {
      title: 'Video by nav_neeti_',
      description: CBSE_CAPTION,
    })
    expect(filtered.description).toBeTruthy()
    expect(filtered.description!.toLowerCase()).toContain('cbse')
    expect(filtered.contentHook?.toLowerCase()).toMatch(/cbse|student|failed/)
  })

  it('extractContentHook prefers CBSE line over Video by', () => {
    const hook = extractContentHook('Video by nav_neeti_', CBSE_CAPTION)
    expect(hook?.toLowerCase()).toMatch(/cbse|student|failed/)
  })
})
