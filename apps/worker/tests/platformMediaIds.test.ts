import { describe, expect, it } from 'vitest'

import {
  extractYoutubeVideoId,
  isRealPlatformMediaId,
  normalizeInstagramMediaUrl,
  normalizeYoutubeMediaUrl,
} from '../src/uploaders/platformMediaIds'

describe('isRealPlatformMediaId', () => {
  it('accepts real YouTube watch/shorts/youtu.be URLs', () => {
    expect(isRealPlatformMediaId('youtube', 'https://www.youtube.com/watch?v=nW68t-yqvUs')).toBe(true)
    expect(isRealPlatformMediaId('youtube', 'https://youtu.be/nW68t-yqvUs')).toBe(true)
    expect(isRealPlatformMediaId('youtube', 'https://www.youtube.com/shorts/nW68t-yqvUs')).toBe(true)
  })

  it('accepts YouTube Studio video URLs (normalized via video id)', () => {
    expect(
      isRealPlatformMediaId('youtube', 'https://studio.youtube.com/video/nW68t-yqvUs/edit'),
    ).toBe(true)
  })

  it('accepts real Instagram reel/p/tv URLs', () => {
    expect(isRealPlatformMediaId('instagram', 'https://www.instagram.com/reel/ABC123xyz/')).toBe(true)
    expect(isRealPlatformMediaId('instagram', 'https://www.instagram.com/p/ABC123xyz/')).toBe(true)
    expect(
      isRealPlatformMediaId('instagram', 'https://www.instagram.com/shonensnaps/reel/DUIrl0ck8AR/'),
    ).toBe(true)
  })

  it('rejects synthetic ig-/yt- placeholders from false Share success', () => {
    expect(
      isRealPlatformMediaId(
        'instagram',
        'ig-d2c2f0b4-b9d0-41ec-8247-aff5da8aa587-1783623944909',
      ),
    ).toBe(false)
    expect(isRealPlatformMediaId('youtube', 'yt-job-pw-1-1783623944909')).toBe(false)
  })

  it('rejects empty or unrelated strings', () => {
    expect(isRealPlatformMediaId('instagram', null)).toBe(false)
    expect(isRealPlatformMediaId('instagram', 'Shared')).toBe(false)
    expect(isRealPlatformMediaId('youtube', 'uploaded')).toBe(false)
  })
})

describe('extractYoutubeVideoId / normalizeYoutubeMediaUrl', () => {
  it('extracts ids from Studio and public URLs', () => {
    expect(extractYoutubeVideoId('https://studio.youtube.com/video/nW68t-yqvUs/edit')).toBe(
      'nW68t-yqvUs',
    )
    expect(normalizeYoutubeMediaUrl('https://studio.youtube.com/video/nW68t-yqvUs/edit')).toBe(
      'https://youtu.be/nW68t-yqvUs',
    )
    expect(normalizeYoutubeMediaUrl('https://www.youtube.com/watch?v=nW68t-yqvUs&t=12')).toBe(
      'https://youtu.be/nW68t-yqvUs',
    )
  })

  it('returns null for non-video strings', () => {
    expect(normalizeYoutubeMediaUrl('https://studio.youtube.com/channel/UC123/videos')).toBeNull()
  })
})

describe('normalizeInstagramMediaUrl', () => {
  it('normalizes relative reel hrefs', () => {
    expect(normalizeInstagramMediaUrl('/reel/ABC123xyz/')).toBe(
      'https://www.instagram.com/reel/ABC123xyz/',
    )
  })

  it('normalizes username-prefixed reel hrefs', () => {
    expect(normalizeInstagramMediaUrl('/shonensnaps/reel/DUIrl0ck8AR/')).toBe(
      'https://www.instagram.com/shonensnaps/reel/DUIrl0ck8AR/',
    )
  })

  it('returns null for non-media paths', () => {
    expect(normalizeInstagramMediaUrl('/shonensnaps/')).toBeNull()
  })
})
