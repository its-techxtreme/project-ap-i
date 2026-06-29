import { describe, expect, it } from 'vitest'
import { NicheSlugSchema, SubmitJobSchema } from '../src/schemas'

const VALID_NICHE_ID = '550e8400-e29b-41d4-a716-446655440000'

describe('SubmitJobSchema', () => {
  it('passes valid YouTube submission with rightsConfirmed true and valid UUID niche', () => {
    const result = SubmitJobSchema.safeParse({
      sourceUrl: 'https://www.youtube.com/shorts/abc123',
      sourcePlatform: 'youtube',
      nicheId: VALID_NICHE_ID,
      rightsConfirmed: true,
    })
    expect(result.success).toBe(true)
  })

  it('passes valid Instagram submission', () => {
    const result = SubmitJobSchema.safeParse({
      sourceUrl: 'https://www.instagram.com/reel/abc123/',
      sourcePlatform: 'instagram',
      nicheId: VALID_NICHE_ID,
      rightsConfirmed: true,
    })
    expect(result.success).toBe(true)
  })

  it('rejects rightsConfirmed false with rights message', () => {
    const result = SubmitJobSchema.safeParse({
      sourceUrl: 'https://www.youtube.com/shorts/abc123',
      sourcePlatform: 'youtube',
      nicheId: VALID_NICHE_ID,
      rightsConfirmed: false,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(' ')
      expect(messages).toMatch(/rights/i)
    }
  })

  it('rejects missing rightsConfirmed', () => {
    const result = SubmitJobSchema.safeParse({
      sourceUrl: 'https://www.youtube.com/shorts/abc123',
      sourcePlatform: 'youtube',
      nicheId: VALID_NICHE_ID,
    })
    expect(result.success).toBe(false)
  })

  it('rejects unsupported URL in sourceUrl', () => {
    const result = SubmitJobSchema.safeParse({
      sourceUrl: 'https://tiktok.com/video/abc',
      sourcePlatform: 'youtube',
      nicheId: VALID_NICHE_ID,
      rightsConfirmed: true,
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid sourcePlatform value', () => {
    const result = SubmitJobSchema.safeParse({
      sourceUrl: 'https://www.youtube.com/shorts/abc123',
      sourcePlatform: 'tiktok',
      nicheId: VALID_NICHE_ID,
      rightsConfirmed: true,
    })
    expect(result.success).toBe(false)
  })

  it('rejects non-UUID nicheId', () => {
    const result = SubmitJobSchema.safeParse({
      sourceUrl: 'https://www.youtube.com/shorts/abc123',
      sourcePlatform: 'youtube',
      nicheId: 'not-a-uuid',
      rightsConfirmed: true,
    })
    expect(result.success).toBe(false)
  })

  it('rejects targetAccountId so submitters cannot set upload accounts', () => {
    const result = SubmitJobSchema.safeParse({
      sourceUrl: 'https://www.youtube.com/shorts/abc123',
      sourcePlatform: 'youtube',
      nicheId: VALID_NICHE_ID,
      rightsConfirmed: true,
      targetAccountId: VALID_NICHE_ID,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.code === 'unrecognized_keys')).toBe(true)
    }
  })
})

describe('NicheSlugSchema', () => {
  it.each(['memes', 'anime', 'sports'] as const)('accepts %s', (slug) => {
    expect(NicheSlugSchema.safeParse(slug).success).toBe(true)
  })

  it.each(['news', 'gaming', ''] as const)('rejects %s', (slug) => {
    expect(NicheSlugSchema.safeParse(slug).success).toBe(false)
  })
})
