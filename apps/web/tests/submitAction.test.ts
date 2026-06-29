import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resetSubmissionRateLimits } from '@/lib/rate-limit/submission'

const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`)
})

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const MEMES_NICHE_ID = '11111111-1111-4111-8111-111111111111'
const SPORTS_NICHE_ID = '33333333-3333-4333-8333-333333333333'
const JOB_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const createClientMock = vi.fn()
const duplicateMaybeSingleMock = vi.fn()
const jobInsertMock = vi.fn()
const jobInsertSingleMock = vi.fn()
const auditInsertMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => createClientMock(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === 'jobs') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                not: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: duplicateMaybeSingleMock,
                  }),
                }),
              }),
            }),
          }),
          insert: jobInsertMock,
        }
      }
      if (table === 'audit_logs') {
        return { insert: auditInsertMock }
      }
      throw new Error(`Unexpected admin table: ${table}`)
    },
  },
}))

function mockAuthenticatedUser() {
  const nicheSingleMock = vi.fn().mockResolvedValue({
    data: { id: MEMES_NICHE_ID, name: 'Memes', slug: 'memes' },
    error: null,
  })

  createClientMock.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: USER_ID } },
        error: null,
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: nicheSingleMock,
          }),
        }),
      }),
    }),
  })
}

function mockSportsNiche() {
  createClientMock.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: USER_ID } },
        error: null,
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: SPORTS_NICHE_ID, name: 'Sports', slug: 'sports' },
              error: null,
            }),
          }),
        }),
      }),
    }),
  })
}

function mockInactiveNiche() {
  createClientMock.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: USER_ID } },
        error: null,
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'not found' },
            }),
          }),
        }),
      }),
    }),
  })
}

function mockSuccessfulInsert(captured: { insert?: Record<string, unknown> }) {
  jobInsertMock.mockImplementation((payload: Record<string, unknown>) => {
    captured.insert = payload
    return {
      select: vi.fn().mockReturnValue({
        single: jobInsertSingleMock,
      }),
    }
  })

  jobInsertSingleMock.mockResolvedValue({
    data: { id: JOB_ID, public_job_code: 'AP-I-TEST-0001' },
    error: null,
  })

  auditInsertMock.mockResolvedValue({ data: null, error: null })
}

describe('submitJobAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    resetSubmissionRateLimits()
    duplicateMaybeSingleMock.mockResolvedValue({ data: null, error: null })
  })

  it('returns success for valid YouTube URL + niche + rightsConfirmed true', async () => {
    mockAuthenticatedUser()
    const captured: { insert?: Record<string, unknown> } = {}
    mockSuccessfulInsert(captured)

    const { submitJobAction } = await import('@/app/actions/submitJob')
    const result = await submitJobAction({
      sourceUrl: 'https://www.youtube.com/shorts/abc123',
      sourcePlatform: 'youtube',
      nicheId: MEMES_NICHE_ID,
      rightsConfirmed: true,
    })

    expect(result).toEqual({
      success: true,
      jobId: JOB_ID,
      publicJobCode: 'AP-I-TEST-0001',
      nicheLabel: 'Memes',
    })
  })

  it('returns success for valid Instagram URL + niche + rights confirmed', async () => {
    mockAuthenticatedUser()
    mockSuccessfulInsert({})

    const { submitJobAction } = await import('@/app/actions/submitJob')
    const result = await submitJobAction({
      sourceUrl: 'https://www.instagram.com/reel/abc123/',
      sourcePlatform: 'instagram',
      nicheId: MEMES_NICHE_ID,
      rightsConfirmed: true,
    })

    expect(result.success).toBe(true)
  })

  it('accepts Sports niche UUID', async () => {
    mockSportsNiche()
    mockSuccessfulInsert({})

    const { submitJobAction } = await import('@/app/actions/submitJob')
    const result = await submitJobAction({
      sourceUrl: 'https://www.youtube.com/shorts/sports1',
      sourcePlatform: 'youtube',
      nicheId: SPORTS_NICHE_ID,
      rightsConfirmed: true,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.nicheLabel).toBe('Sports')
    }
  })

  it('returns validation error when rightsConfirmed is false', async () => {
    mockAuthenticatedUser()

    const { submitJobAction } = await import('@/app/actions/submitJob')
    const result = await submitJobAction({
      sourceUrl: 'https://www.youtube.com/shorts/abc123',
      sourcePlatform: 'youtube',
      nicheId: MEMES_NICHE_ID,
      rightsConfirmed: false,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.fieldErrors?.rightsConfirmed).toBeDefined()
    }
  })

  it('returns domain error for unsupported TikTok URL', async () => {
    mockAuthenticatedUser()

    const { submitJobAction } = await import('@/app/actions/submitJob')
    const result = await submitJobAction({
      sourceUrl: 'https://tiktok.com/@user/video/123',
      sourcePlatform: 'youtube',
      nicheId: MEMES_NICHE_ID,
      rightsConfirmed: true,
    })

    expect(result).toEqual({
      success: false,
      error: 'Validation failed. Please check your inputs.',
      fieldErrors: expect.any(Object),
    })
  })

  it('returns domain error for localhost URL', async () => {
    mockAuthenticatedUser()

    const { submitJobAction } = await import('@/app/actions/submitJob')
    const result = await submitJobAction({
      sourceUrl: 'https://localhost/shorts/abc',
      sourcePlatform: 'youtube',
      nicheId: MEMES_NICHE_ID,
      rightsConfirmed: true,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const combined = `${result.error} ${JSON.stringify(result.fieldErrors ?? {})}`
      expect(combined).toMatch(/not allowed|supported/i)
    }
  })

  it('redirects unauthenticated requests to /login', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    })

    const { submitJobAction } = await import('@/app/actions/submitJob')
    await expect(
      submitJobAction({
        sourceUrl: 'https://www.youtube.com/shorts/abc123',
        sourcePlatform: 'youtube',
        nicheId: MEMES_NICHE_ID,
        rightsConfirmed: true,
      }),
    ).rejects.toThrow('REDIRECT:/login')
  })

  it('returns validation error when nicheId is missing', async () => {
    mockAuthenticatedUser()

    const { submitJobAction } = await import('@/app/actions/submitJob')
    const result = await submitJobAction({
      sourceUrl: 'https://www.youtube.com/shorts/abc123',
      sourcePlatform: 'youtube',
      rightsConfirmed: true,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.fieldErrors?.nicheId).toBeDefined()
    }
  })

  it('returns niche error when niche is inactive', async () => {
    mockInactiveNiche()

    const { submitJobAction } = await import('@/app/actions/submitJob')
    const result = await submitJobAction({
      sourceUrl: 'https://www.youtube.com/shorts/abc123',
      sourcePlatform: 'youtube',
      nicheId: MEMES_NICHE_ID,
      rightsConfirmed: true,
    })

    expect(result).toEqual({
      success: false,
      error: 'Selected niche is not available. Contact admin.',
    })
  })

  it('returns duplicate error for active URL + niche combination', async () => {
    mockAuthenticatedUser()
    duplicateMaybeSingleMock.mockResolvedValue({
      data: { id: JOB_ID, status: 'queued' },
      error: null,
    })

    const { submitJobAction } = await import('@/app/actions/submitJob')
    const result = await submitJobAction({
      sourceUrl: 'https://www.youtube.com/shorts/abc123',
      sourcePlatform: 'youtube',
      nicheId: MEMES_NICHE_ID,
      rightsConfirmed: true,
    })

    expect(result).toEqual({
      success: false,
      error: 'This link has already been submitted for this niche and is being processed.',
    })
  })

  it('inserts job with status queued', async () => {
    mockAuthenticatedUser()
    const captured: { insert?: Record<string, unknown> } = {}
    mockSuccessfulInsert(captured)

    const { submitJobAction } = await import('@/app/actions/submitJob')
    await submitJobAction({
      sourceUrl: 'https://www.youtube.com/shorts/abc123',
      sourcePlatform: 'youtube',
      nicheId: MEMES_NICHE_ID,
      rightsConfirmed: true,
    })

    expect(captured.insert?.status).toBe('queued')
  })

  it('inserts job with rights_confirmed true', async () => {
    mockAuthenticatedUser()
    const captured: { insert?: Record<string, unknown> } = {}
    mockSuccessfulInsert(captured)

    const { submitJobAction } = await import('@/app/actions/submitJob')
    await submitJobAction({
      sourceUrl: 'https://www.youtube.com/shorts/abc123',
      sourcePlatform: 'youtube',
      nicheId: MEMES_NICHE_ID,
      rightsConfirmed: true,
    })

    expect(captured.insert?.rights_confirmed).toBe(true)
  })

  it('does not set target account IDs on insert', async () => {
    mockAuthenticatedUser()
    const captured: { insert?: Record<string, unknown> } = {}
    mockSuccessfulInsert(captured)

    const { submitJobAction } = await import('@/app/actions/submitJob')
    await submitJobAction({
      sourceUrl: 'https://www.youtube.com/shorts/abc123',
      sourcePlatform: 'youtube',
      nicheId: MEMES_NICHE_ID,
      rightsConfirmed: true,
    })

    expect(captured.insert).not.toHaveProperty('target_youtube_account_id')
    expect(captured.insert).not.toHaveProperty('target_instagram_account_id')
  })

  it('writes audit log with action job_created', async () => {
    mockAuthenticatedUser()
    mockSuccessfulInsert({})

    const { submitJobAction } = await import('@/app/actions/submitJob')
    await submitJobAction({
      sourceUrl: 'https://www.youtube.com/shorts/abc123',
      sourcePlatform: 'youtube',
      nicheId: MEMES_NICHE_ID,
      rightsConfirmed: true,
    })

    expect(auditInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_user_id: USER_ID,
        actor_type: 'user',
        action: 'job_created',
        target_type: 'job',
        target_id: JOB_ID,
      }),
    )
  })
})

describe('checkSubmissionRateLimit', () => {
  beforeEach(() => {
    resetSubmissionRateLimits()
  })

  it('blocks more than 20 submissions per day per user', async () => {
    const { checkSubmissionRateLimit, recordSubmission } = await import(
      '@/lib/rate-limit/submission'
    )

    for (let i = 0; i < 20; i += 1) {
      recordSubmission(USER_ID)
    }

    expect(checkSubmissionRateLimit(USER_ID)).toEqual({
      allowed: false,
      error: 'Submission limit reached. Please wait before trying again.',
    })
  })
})
