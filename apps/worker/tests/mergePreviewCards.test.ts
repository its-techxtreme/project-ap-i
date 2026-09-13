import { describe, expect, it } from 'vitest'

import { mergePreviewCards } from '../src/collector/mergePreviewCards'

describe('mergePreviewCards', () => {
  it('keeps href-only tiles that the media pass missed', () => {
    const mapped = [
      { x: 400, y: 200, followingText: 'Anime', href: 'https://www.instagram.com/reel/AbC123xyzAB/' },
    ]
    const pane = [
      { x: 400, y: 200, followingText: 'Anime', href: 'https://www.instagram.com/reel/AbC123xyzAB/' },
      { x: 410, y: 520, followingText: 'Sports', href: 'https://www.instagram.com/reel/XyZ987abcDE/' },
    ]
    const merged = mergePreviewCards(mapped, pane)
    expect(merged).toHaveLength(2)
    expect(merged[1]?.href).toContain('XyZ987abcDE')
  })
})
