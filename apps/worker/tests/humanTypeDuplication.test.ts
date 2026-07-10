import { describe, expect, it } from 'vitest'

import { isDuplicatedMetadataText } from '../src/uploaders/playwrightHumanBehavior'

describe('isDuplicatedMetadataText', () => {
  const caption =
    "When you finally get the meme, but it's still kinda confusing... Share your favorite memes with us in the comments"

  it('accepts a clean single caption', () => {
    expect(isDuplicatedMetadataText(caption, caption)).toBe(false)
  })

  it('detects the mid-type restart duplication from IG/YT uploads', () => {
    const broken =
      "When you finally get the meme, but it's still kinda confusing... Share your favorite memes with us in the comments b" +
      "When you finally get the meme, but it's still kinda confusing... Share your favorite memes with u"
    expect(isDuplicatedMetadataText(broken, caption)).toBe(true)
  })

  it('detects exact double paste', () => {
    expect(isDuplicatedMetadataText(`${caption} ${caption}`, caption)).toBe(true)
  })

  it('ignores empty expected', () => {
    expect(isDuplicatedMetadataText('anything', '')).toBe(false)
  })
})
