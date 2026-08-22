import { beforeEach, describe, expect, it, vi } from 'vitest'

const inboxMaybeSingle = vi.fn()
const inboxList = vi.fn()
const inboxUpdateEq = vi.fn()
const inboxInsert = vi.fn()
const nicheMaybeSingle = vi.fn()
const nicheSingle = vi.fn()
const jobsMaybeSingle = vi.fn()
const jobsInsertSingle = vi.fn()
const auditInsert = vi.fn()

vi.mock('../src/db/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === 'collector_inbox_items') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: inboxMaybeSingle,
              then(
                onFulfilled: (value: unknown) => unknown,
                onRejected?: (reason: unknown) => unknown,
              ) {
                return Promise.resolve(inboxList()).then(onFulfilled, onRejected)
              },
            }),
          }),
          insert: inboxInsert,
          update: () => ({
            eq: () => inboxUpdateEq(),
          }),
        }
      }
      if (table === 'niches') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: nicheMaybeSingle,
                single: nicheSingle,
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
                not: () => ({
                  limit: () => ({ maybeSingle: jobsMaybeSingle }),
                }),
              }),
            }),
          }),
          insert: () => ({
            select: () => ({ single: jobsInsertSingle }),
          }),
        }
      }
      if (table === 'audit_logs') {
        return { insert: auditInsert }
      }
      throw new Error(`Unexpected table ${table}`)
    },
  },
}))

vi.mock('../src/logging/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const ANIME_ID = '11111111-1111-4111-8111-111111111111'
const JOB_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const REEL = 'https://www.instagram.com/reel/AbC123xyzAB/'
const THREAD = 'https://www.instagram.com/direct/t/17842064415169224/'
const BOGUS = 'https://www.instagram.com/reel/DSsjXDoDX2vwbOB7apBYlBscOjI5izCC4crQzA0/'

describe('persistCollectedReels', () => {
  beforeEach(() => {
    vi.resetModules()
    inboxMaybeSingle.mockReset()
    inboxList.mockReset()
    inboxUpdateEq.mockReset()
    inboxInsert.mockReset()
    nicheMaybeSingle.mockReset()
    nicheSingle.mockReset()
    jobsMaybeSingle.mockReset()
    jobsInsertSingle.mockReset()
    auditInsert.mockReset()
    inboxMaybeSingle.mockResolvedValue({ data: null, error: null })
    inboxList.mockResolvedValue({ data: [], error: null })
    inboxUpdateEq.mockResolvedValue({ error: null })
    inboxInsert.mockResolvedValue({ error: null })
    nicheMaybeSingle.mockResolvedValue({ data: { id: ANIME_ID }, error: null })
    nicheSingle.mockResolvedValue({
      data: { id: ANIME_ID, name: 'Anime', slug: 'anime' },
      error: null,
    })
    jobsMaybeSingle.mockResolvedValue({ data: null, error: null })
    jobsInsertSingle.mockResolvedValue({
      data: { id: JOB_ID, public_job_code: 'AP-I-1' },
      error: null,
    })
    auditInsert.mockResolvedValue({ error: null })
  })

  it('queues reels that include a niche word', async () => {
    const { persistCollectedReels } = await import('../src/collector/persistCollectedReels')
    const result = await persistCollectedReels([
      {
        sourceUrl: REEL,
        nearbyText: 'please post this anime',
        senderUsername: 'crew',
        threadId: THREAD,
      },
    ])
    expect(result).toEqual({ queued: 1, pendingNiche: 0, duplicate: 0, invalid: 0 })
    expect(inboxInsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'queued', niche_slug: 'anime', job_id: JOB_ID }),
    )
  })

  it('queues when Anime is on the next line under Sent a reel', async () => {
    const { persistCollectedReels } = await import('../src/collector/persistCollectedReels')
    const result = await persistCollectedReels([
      {
        sourceUrl: REEL,
        nearbyText: 'You sent a reel\nAnime',
        senderUsername: 'crew',
        threadId: THREAD,
      },
    ])
    expect(result.queued).toBe(1)
  })

  it('stores reels without a niche for admin review', async () => {
    const { persistCollectedReels } = await import('../src/collector/persistCollectedReels')
    const result = await persistCollectedReels([
      {
        sourceUrl: REEL,
        nearbyText: 'check this out',
        senderUsername: 'crew',
        threadId: THREAD,
      },
    ])
    expect(result.pendingNiche).toBe(1)
    expect(inboxInsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending_niche', niche_slug: null }),
    )
  })

  it('counts already-seen URLs as duplicates', async () => {
    inboxMaybeSingle.mockResolvedValue({ data: { id: 'x', status: 'queued' }, error: null })
    const { persistCollectedReels } = await import('../src/collector/persistCollectedReels')
    inboxInsert.mockClear()
    const result = await persistCollectedReels([
      {
        sourceUrl: REEL,
        nearbyText: 'anime',
        senderUsername: 'crew',
        threadId: THREAD,
      },
    ])
    expect(result.duplicate).toBe(1)
    expect(inboxInsert).not.toHaveBeenCalled()
  })

  it('promotes pending-niche rows into jobs when a niche word is present', async () => {
    inboxMaybeSingle.mockResolvedValue({ data: { id: 'pending-row', status: 'pending_niche' }, error: null })
    const { persistCollectedReels } = await import('../src/collector/persistCollectedReels')
    inboxInsert.mockClear()
    const result = await persistCollectedReels([
      {
        sourceUrl: REEL,
        nearbyText: 'anime',
        senderUsername: 'crew',
        threadId: THREAD,
      },
    ])
    expect(result.queued).toBe(1)
    expect(inboxInsert).not.toHaveBeenCalled()
    expect(inboxUpdateEq).toHaveBeenCalled()
  })

  it('rejects non-instagram URLs', async () => {
    const { persistCollectedReels } = await import('../src/collector/persistCollectedReels')
    const result = await persistCollectedReels([
      {
        sourceUrl: 'https://www.youtube.com/shorts/abc',
        nearbyText: 'anime',
        senderUsername: 'crew',
        threadId: THREAD,
      },
    ])
    expect(result.invalid).toBe(1)
  })

  it('rejects concatenated profile-grid URLs', async () => {
    const { persistCollectedReels } = await import('../src/collector/persistCollectedReels')
    const result = await persistCollectedReels([
      {
        sourceUrl: BOGUS,
        nearbyText: 'anime',
        senderUsername: 'unknown',
        threadId: THREAD,
      },
    ])
    expect(result.invalid).toBe(1)
    expect(inboxInsert).not.toHaveBeenCalled()
  })

  it('rejects reels that were not taken from a Direct thread', async () => {
    const { persistCollectedReels } = await import('../src/collector/persistCollectedReels')
    const result = await persistCollectedReels([
      {
        sourceUrl: REEL,
        nearbyText: 'anime',
        senderUsername: 'unknown',
        threadId: 'https://www.instagram.com/someuser/',
      },
    ])
    expect(result.invalid).toBe(1)
    expect(inboxInsert).not.toHaveBeenCalled()
  })

  it('marks pending inbox rows with implausible shortcodes invalid', async () => {
    inboxList.mockResolvedValue({
      data: [{ id: 'bogus-row', normalized_source_url: BOGUS }],
      error: null,
    })
    const { rejectBogusCollectorInboxItems } = await import('../src/collector/persistCollectedReels')
    const rejected = await rejectBogusCollectorInboxItems()
    expect(rejected).toBe(1)
    expect(inboxUpdateEq).toHaveBeenCalled()
  })
})
