import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/config', () => ({
  config: {
    DAILY_UPLOAD_LIMIT_PER_ACCOUNT: 5,
    UPLOAD_STALE_THRESHOLD_MS: 1_500_000,
  },
}))

const fromMock = vi.fn()

vi.mock('../src/db/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}))

vi.mock('../src/uploaders/accountResolver', () => ({
  resolveNicheAccounts: vi.fn().mockResolvedValue({
    youtube: { id: 'yt-acc-1', accountLabel: 'Memes YT' },
    instagram: { id: 'ig-acc-1', accountLabel: 'Memes IG' },
  }),
}))

describe('dailyUploadLimit', () => {
  beforeEach(() => {
    fromMock.mockReset()
  })

  it('detects YouTube daily limit error copy', async () => {
    const { isDailyUploadLimitError } = await import('../src/jobs/dailyUploadLimit')
    expect(isDailyUploadLimitError('Daily upload limit reached')).toBe(true)
    expect(isDailyUploadLimitError('Something else failed')).toBe(false)
  })

  it('rollingWindowStartIso is 24 hours before now', async () => {
    const { rollingWindowStartIso, DAILY_UPLOAD_WINDOW_MS } = await import(
      '../src/jobs/dailyUploadLimit'
    )
    const now = new Date('2026-07-11T15:30:00.000Z')
    const start = rollingWindowStartIso(now)
    expect(start).toBe(new Date(now.getTime() - DAILY_UPLOAD_WINDOW_MS).toISOString())
  })

  it('blocks when an account already has 5 successful uploads today', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'upload_attempts') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  gte: async () => ({
                    data: [
                      { job_id: 'j1' },
                      { job_id: 'j2' },
                      { job_id: 'j3' },
                      { job_id: 'j4' },
                      { job_id: 'j5' },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'jobs') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: async () => ({ data: [], error: null }),
              }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    })

    const { checkNicheDailyUploadLimits } = await import('../src/jobs/dailyUploadLimit')
    const check = await checkNicheDailyUploadLimits('niche-1', {
      youtube: true,
      instagram: false,
    })

    expect(check.blocked).toBe(true)
    expect(check.limit).toBe(5)
    expect(check.blockedPlatforms[0]?.platform).toBe('youtube')
    expect(check.blockedPlatforms[0]?.used).toBe(5)
  })

  it('allows upload when under the daily cap', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'upload_attempts') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  gte: async () => ({
                    data: [{ job_id: 'j1' }, { job_id: 'j2' }],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'jobs') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: async () => ({ data: [], error: null }),
              }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    })

    const { checkNicheDailyUploadLimits } = await import('../src/jobs/dailyUploadLimit')
    const check = await checkNicheDailyUploadLimits('niche-1')
    expect(check.blocked).toBe(false)
    expect(check.usages.every((u) => u.used === 2)).toBe(true)
  })
})
