import { describe, expect, it } from 'vitest'
import {
  ALLOWED_HOSTNAMES,
  DEFAULTS,
  NICHES,
  NICHE_SLUGS,
  PLATFORMS,
} from '../src/constants'

describe('constants', () => {
  it('NICHES has exactly 3 entries', () => {
    expect(NICHES).toHaveLength(3)
  })

  it('NICHE_SLUGS contains memes, anime, sports and nothing else', () => {
    expect(NICHE_SLUGS).toEqual(['memes', 'anime', 'sports'])
    expect(NICHE_SLUGS).toHaveLength(3)
  })

  it('PLATFORMS contains youtube and instagram and nothing else', () => {
    expect(PLATFORMS).toEqual(['youtube', 'instagram'])
    expect(PLATFORMS).toHaveLength(2)
  })

  it('ALLOWED_HOSTNAMES has exactly 6 entries', () => {
    expect(ALLOWED_HOSTNAMES).toHaveLength(6)
  })

  it('DEFAULTS.MAX_FFMPEG_CONCURRENCY equals 1', () => {
    expect(DEFAULTS.MAX_FFMPEG_CONCURRENCY).toBe(1)
  })
})
