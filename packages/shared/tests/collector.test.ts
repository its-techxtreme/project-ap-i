import { describe, expect, it } from 'vitest'

import {
  extractInstagramReelUrls,
  instagramEmbedUrl,
  parseCollectorNiche,
  prepareSourceIngest,
  zipUrlsWithFollowingText,
} from '../src/collector'

describe('parseCollectorNiche', () => {
  it('maps aliases to canonical slugs', () => {
    expect(parseCollectorNiche('anime')).toBe('anime')
    expect(parseCollectorNiche('Memes please')).toBe('memes')
    expect(parseCollectorNiche('meme')).toBe('memes')
    expect(parseCollectorNiche('SPORT')).toBe('sports')
    expect(parseCollectorNiche('sports')).toBe('sports')
  })

  it('returns null when missing or ambiguous', () => {
    expect(parseCollectorNiche('')).toBeNull()
    expect(parseCollectorNiche('hello')).toBeNull()
    expect(parseCollectorNiche('anime and sports')).toBeNull()
  })
})

describe('extractInstagramReelUrls', () => {
  it('dedupes reel permalinks from html', () => {
    const html =
      '<a href="https://www.instagram.com/reel/AbC123/">x</a>' +
      '<a href="https://instagram.com/reels/AbC123">y</a>' +
      '<a href="https://www.instagram.com/p/Zz9AbCdeFgH/">z</a>'
    expect(extractInstagramReelUrls(html)).toEqual([
      'https://www.instagram.com/reel/AbC123/',
      'https://www.instagram.com/reel/Zz9AbCdeFgH/',
    ])
  })

  it('ignores non-instagram hosts', () => {
    expect(extractInstagramReelUrls('https://tiktok.com/@x/video/1')).toEqual([])
  })

  it('accepts relative Instagram reel hrefs from DM html', () => {
    expect(extractInstagramReelUrls('<a href="/reel/AbC123/">x</a>')).toEqual([
      'https://www.instagram.com/reel/AbC123/',
    ])
  })

  it('pulls reel codes from escaped Instagram JSON used by share cards', () => {
    expect(extractInstagramReelUrls('"url":"https:\\/\\/www.instagram.com\\/reel\\/AbC123xyzAB\\/"')).toEqual([
      'https://www.instagram.com/reel/AbC123xyzAB/',
    ])
  })

  it('pulls shortcodes from GraphQL-style JSON', () => {
    expect(extractInstagramReelUrls('{"shortcode":"AbC123xyzAB"}')).toEqual([
      'https://www.instagram.com/reel/AbC123xyzAB/',
    ])
  })

  it('pulls media code from DM share JSON that never says reel', () => {
    expect(
      extractInstagramReelUrls('{"clip":{"code":"AbC123xyzAB","product_type":"clips"}}'),
    ).toEqual(['https://www.instagram.com/reel/AbC123xyzAB/'])
  })
})

describe('prepareSourceIngest', () => {
  it('accepts instagram reels and rejects unsupported hosts', () => {
    const ok = prepareSourceIngest('https://www.instagram.com/reel/AbC123/')
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.platform).toBe('instagram')

    const bad = prepareSourceIngest('https://tiktok.com/video/1')
    expect(bad.ok).toBe(false)
  })
})

describe('instagramEmbedUrl', () => {
  it('builds an embed path', () => {
    expect(instagramEmbedUrl('https://www.instagram.com/reel/AbC123/')).toBe(
      'https://www.instagram.com/reel/AbC123/embed/',
    )
  })
})

describe('zipUrlsWithFollowingText', () => {
  it('keeps Sport vs Anime on separate reels', () => {
    const zipped = zipUrlsWithFollowingText(
      ['https://www.instagram.com/reel/Aaa11111111/', 'https://www.instagram.com/reel/Bbb22222222/'],
      ['Sport', 'Anime'],
    )
    expect(parseCollectorNiche(zipped[0]!.nearbyText)).toBe('sports')
    expect(parseCollectorNiche(zipped[1]!.nearbyText)).toBe('anime')
  })
})
