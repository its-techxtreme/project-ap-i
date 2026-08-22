import { describe, expect, it } from 'vitest'

import {
  extractInstagramReelUrls,
  instagramEmbedUrl,
  instagramShortcodeFromUrl,
  parseCollectorNiche,
  pickNicheFromFollowingText,
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

describe('pickNicheFromFollowingText', () => {
  it('finds Anime under a Sent-a-reel label', () => {
    expect(pickNicheFromFollowingText('You sent a reel\nAnime')).toBe('anime')
    expect(pickNicheFromFollowingText('Sent a reel\nSport')).toBe('sports')
  })

  it('uses the first clean line when two niche bubbles leak into one band', () => {
    expect(pickNicheFromFollowingText('Anime\nSport')).toBe('anime')
  })

  it('still rejects a single ambiguous line', () => {
    expect(pickNicheFromFollowingText('anime and sports')).toBeNull()
  })
})

describe('extractInstagramReelUrls', () => {
  it('dedupes reel permalinks from html', () => {
    const html =
      '<a href="https://www.instagram.com/reel/AbC123xyzAB/">x</a>' +
      '<a href="https://instagram.com/reels/AbC123xyzAB">y</a>' +
      '<a href="https://www.instagram.com/p/Zz9AbCdeFgH/">z</a>'
    expect(extractInstagramReelUrls(html)).toEqual([
      'https://www.instagram.com/reel/AbC123xyzAB/',
      'https://www.instagram.com/reel/Zz9AbCdeFgH/',
    ])
  })

  it('ignores non-instagram hosts', () => {
    expect(extractInstagramReelUrls('https://tiktok.com/@x/video/1')).toEqual([])
  })

  it('accepts relative Instagram reel hrefs from DM html', () => {
    expect(extractInstagramReelUrls('<a href="/reel/AbC123xyzAB/">x</a>')).toEqual([
      'https://www.instagram.com/reel/AbC123xyzAB/',
    ])
  })

  it('pulls reel codes from escaped Instagram JSON used by share cards', () => {
    expect(
      extractInstagramReelUrls('"url":"https:\\/\\/www.instagram.com\\/reel\\/AbC123xyzAB\\/"'),
    ).toEqual(['https://www.instagram.com/reel/AbC123xyzAB/'])
  })

  it('pulls media code from clips JSON, not generic GraphQL code fields', () => {
    expect(
      extractInstagramReelUrls('{"clip":{"product_type":"clips","code":"AbC123xyzAB"}}'),
    ).toEqual(['https://www.instagram.com/reel/AbC123xyzAB/'])
    expect(extractInstagramReelUrls('{"shortcode":"AbC123xyzAB"}')).toEqual([])
  })

  it('rejects concatenated profile-grid junk instead of inventing a shortcode', () => {
    expect(
      extractInstagramReelUrls(
        'https://www.instagram.com/reel/DSsjXDoDX2vwbOB7apBYlBscOjI5izCC4crQzA0/',
      ),
    ).toEqual([])
  })
})

describe('instagramShortcodeFromUrl', () => {
  it('accepts 11-character reel codes only', () => {
    expect(instagramShortcodeFromUrl('https://www.instagram.com/reel/AbC123xyzAB/')).toBe(
      'AbC123xyzAB',
    )
    expect(
      instagramShortcodeFromUrl(
        'https://www.instagram.com/reel/DSsjXDoDX2vwbOB7apBYlBscOjI5izCC4crQzA0/',
      ),
    ).toBeNull()
  })
})

describe('prepareSourceIngest', () => {
  it('accepts instagram reels and rejects unsupported hosts', () => {
    const ok = prepareSourceIngest('https://www.instagram.com/reel/AbC123xyzAB/')
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.platform).toBe('instagram')

    const bad = prepareSourceIngest('https://tiktok.com/video/1')
    expect(bad.ok).toBe(false)
  })
})

describe('instagramEmbedUrl', () => {
  it('builds an embed path', () => {
    expect(instagramEmbedUrl('https://www.instagram.com/reel/AbC123xyzAB/')).toBe(
      'https://www.instagram.com/reel/AbC123xyzAB/embed/',
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
