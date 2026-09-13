import { describe, expect, it } from 'vitest'

import { decideHarvestUrl, newestFirst, shouldStopScrolling } from '../src/collector/harvestPolicy'

describe('decideHarvestUrl', () => {
  it('skips a reel already in the inbox so older missed reels can still be taken', () => {
    const known = new Set(['https://www.instagram.com/reel/AbC123xyzAB/'])
    expect(
      decideHarvestUrl('https://www.instagram.com/reel/AbC123xyzAB/', known, new Set()),
    ).toBe('skip')
  })

  it('takes a reel we have not stored yet', () => {
    expect(
      decideHarvestUrl('https://www.instagram.com/reel/AbC123xyzAB/', new Set(), new Set()),
    ).toBe('take')
  })

  it('skips a reel already grabbed this pass', () => {
    const taken = new Set(['https://www.instagram.com/reel/AbC123xyzAB/'])
    expect(
      decideHarvestUrl('https://www.instagram.com/reel/AbC123xyzAB/', new Set(), taken),
    ).toBe('skip')
  })

  it('skips missing hrefs so a failed click does not invent a take', () => {
    expect(decideHarvestUrl(undefined, new Set(), new Set())).toBe('skip')
    expect(decideHarvestUrl('', new Set(), new Set())).toBe('skip')
  })

  it('still takes an older reel when a newer one is already stored', () => {
    const known = new Set(['https://www.instagram.com/reel/NewAlreadyIn/'])
    expect(decideHarvestUrl('https://www.instagram.com/reel/NewAlreadyIn/', known, new Set())).toBe(
      'skip',
    )
    expect(decideHarvestUrl('https://www.instagram.com/reel/OlderMissed1/', known, new Set())).toBe(
      'take',
    )
  })
})

describe('shouldStopScrolling', () => {
  it('keeps going on the first viewport when new reels were taken', () => {
    expect(
      shouldStopScrolling({
        round: 0,
        maxScroll: 8,
        taken: 2,
        maxTaken: 15,
        cardCount: 2,
        noCardStreak: 0,
        noCardLimit: 2,
        newThisRound: 2,
        skippedKnownThisRound: 0,
      }),
    ).toBe(false)
  })

  it('stops after a later round that only shows already-stored reels', () => {
    expect(
      shouldStopScrolling({
        round: 2,
        maxScroll: 8,
        taken: 5,
        maxTaken: 15,
        cardCount: 3,
        noCardStreak: 0,
        noCardLimit: 2,
        newThisRound: 0,
        skippedKnownThisRound: 3,
      }),
    ).toBe(true)
  })

  it('stops after several rounds with no reel cards', () => {
    expect(
      shouldStopScrolling({
        round: 5,
        maxScroll: 8,
        taken: 2,
        maxTaken: 15,
        cardCount: 0,
        noCardStreak: 2,
        noCardLimit: 2,
        newThisRound: 0,
        skippedKnownThisRound: 0,
      }),
    ).toBe(true)
  })
})

describe('newestFirst', () => {
  it('puts lower-on-screen cards first (latest messages)', () => {
    expect(newestFirst([{ y: 120 }, { y: 400 }, { y: 260 }]).map((c) => c.y)).toEqual([
      400, 260, 120,
    ])
  })
})