import { describe, expect, it } from 'vitest'
import {
  ALLOWED_HOSTNAMES,
  DEFAULTS,
  ERROR_CODES,
  JOB_STATUSES,
  NICHES,
  NICHE_SLUGS,
  NicheSlugSchema,
  PLATFORMS,
  ProjectApiError,
  SubmitJobSchema,
  UPLOAD_STATUSES,
  detectPlatform,
  validateSourceUrl,
} from '../src/index'

describe('package entrypoint exports', () => {
  it('re-exports shared domain symbols from index', () => {
    expect(NICHES).toHaveLength(3)
    expect(NICHE_SLUGS).toEqual(['memes', 'anime', 'sports'])
    expect(PLATFORMS).toEqual(['youtube', 'instagram'])
    expect(ALLOWED_HOSTNAMES).toHaveLength(6)
    expect(DEFAULTS.MAX_FFMPEG_CONCURRENCY).toBe(1)
    expect(JOB_STATUSES).toContain('queued')
    expect(UPLOAD_STATUSES).toContain('verified')
    expect(ERROR_CODES.INVALID_URL).toBe('INVALID_URL')
    expect(NicheSlugSchema.safeParse('memes').success).toBe(true)
    expect(SubmitJobSchema).toBeDefined()
    expect(validateSourceUrl('https://youtube.com/shorts/x').valid).toBe(true)
    expect(detectPlatform('https://instagram.com/reel/x/')).toBe('instagram')
    expect(new ProjectApiError('UNAUTHORIZED', 'nope').code).toBe('UNAUTHORIZED')
  })
})
