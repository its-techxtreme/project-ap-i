import { describe, expect, it } from 'vitest'

import {
  DEFAULT_NICHE_HANDLES,
  profileUrlFor,
  resolveProfileHandle,
  reuseYoutubeAvatar,
} from '@/lib/data/fetchPlatformProfile'

describe('fetchPlatformProfile helpers', () => {
  it('maps niche brand handles as fallbacks', () => {
    expect(DEFAULT_NICHE_HANDLES.anime).toBe('theshonensnaps')
    expect(DEFAULT_NICHE_HANDLES.memes).toBe('CrackleCrumb')
    expect(DEFAULT_NICHE_HANDLES.sports).toBe('ScoreMorsel')
  })

  it('prefers username_hint over niche fallback', () => {
    expect(resolveProfileHandle('youtube', '@CustomHandle', 'anime')).toBe('CustomHandle')
    expect(resolveProfileHandle('instagram', '  CustomIG  ', 'memes')).toBe('CustomIG')
  })

  it('falls back to niche brand when hint missing', () => {
    expect(resolveProfileHandle('youtube', null, 'anime')).toBe('theshonensnaps')
    expect(resolveProfileHandle('instagram', '', 'sports')).toBe('ScoreMorsel')
    expect(resolveProfileHandle('instagram', null, 'memes')).toBe('thecracklecrumb')
  })

  it('builds canonical profile URLs', () => {
    expect(profileUrlFor('youtube', 'theshonensnaps')).toBe('https://www.youtube.com/@theshonensnaps')
    expect(profileUrlFor('instagram', '@ScoreMorsel')).toBe(
      'https://www.instagram.com/ScoreMorsel/',
    )
  })

  it('reuses the youtube pfp on instagram when both exist', () => {
    expect(reuseYoutubeAvatar('https://yt.example/a.jpg', 'https://ig.example/b.jpg')).toBe(
      'https://yt.example/a.jpg',
    )
    expect(reuseYoutubeAvatar(null, 'https://ig.example/b.jpg')).toBe('https://ig.example/b.jpg')
    expect(reuseYoutubeAvatar(undefined, null)).toBe(null)
  })
})
