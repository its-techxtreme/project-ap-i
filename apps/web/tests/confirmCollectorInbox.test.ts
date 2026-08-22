import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireAdminWriteMock =
  vi.fn<() => Promise<{ denied: false } | { denied: true; error: string }>>()
const getAdminUsernameMock = vi.fn<() => Promise<string | null>>()

const inboxMaybeSingleMock = vi.fn()
const inboxUpdateEqMock = vi.fn()
const nicheSingleMock = vi.fn()
const nicheMaybeSingleMock = vi.fn()
const duplicateMaybeSingleMock = vi.fn()
const jobInsertMock = vi.fn()
const jobInsertSingleMock = vi.fn()
const auditInsertMock = vi.fn()

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/auth/requireAdmin', () => ({
  requireAdminWrite: () => requireAdminWriteMock(),
}))

vi.mock('@/lib/auth/getUserRole', () => ({
  getAdminUsername: () => getAdminUsernameMock(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === 'collector_inbox_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: inboxMaybeSingleMock,
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: inboxUpdateEqMock,
          }),
        }
      }
      if (table === 'niches') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: nicheSingleMock,
                maybeSingle: nicheMaybeSingleMock,
              }),
            }),
          }),
        }
      }
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
      throw new Error(`Unexpected table: ${table}`)
    },
  },
}))

const INBOX_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const NICHE_ID = '11111111-1111-4111-8111-111111111111'
const JOB_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const REEL_URL = 'https://www.instagram.com/reel/AbC123xyz/'

describe('confirmCollectorInboxItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    requireAdminWriteMock.mockResolvedValue({ denied: false })
    getAdminUsernameMock.mockResolvedValue('captain')
    inboxMaybeSingleMock.mockResolvedValue({
      data: {
        id: INBOX_ID,
        status: 'pending_niche',
        normalized_source_url: REEL_URL,
        sender_username: 'crewmate',
      },
      error: null,
    })
    nicheMaybeSingleMock.mockResolvedValue({ data: { id: NICHE_ID }, error: null })
    nicheSingleMock.mockResolvedValue({
      data: { id: NICHE_ID, name: 'Anime', slug: 'anime' },
      error: null,
    })
    duplicateMaybeSingleMock.mockResolvedValue({ data: null, error: null })
    jobInsertMock.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({ single: jobInsertSingleMock }),
    }))
    jobInsertSingleMock.mockResolvedValue({
      data: { id: JOB_ID, public_job_code: 'AP-I-COL-0001' },
      error: null,
    })
    auditInsertMock.mockResolvedValue({ data: null, error: null })
    inboxUpdateEqMock.mockResolvedValue({ error: null })
  })

  it('denies demo writes', async () => {
    requireAdminWriteMock.mockResolvedValueOnce({
      denied: true,
      error: 'Demo account is read-only. Sign in as admin to run this action.',
    })
    const { confirmCollectorInboxItem } = await import('@/app/actions/confirmCollectorInbox')
    const result = await confirmCollectorInboxItem(INBOX_ID, 'anime')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toMatch(/Demo/)
    }
  })

  it('rejects invalid niche slugs', async () => {
    const { confirmCollectorInboxItem } = await import('@/app/actions/confirmCollectorInbox')
    const result = await confirmCollectorInboxItem(INBOX_ID, 'tiktok')
    expect(result).toEqual({ success: false, error: 'Pick Memes, Anime, or Sports.' })
  })

  it('queues a pending reel after admin picks a niche', async () => {
    const { confirmCollectorInboxItem } = await import('@/app/actions/confirmCollectorInbox')
    const result = await confirmCollectorInboxItem(INBOX_ID, 'anime')
    expect(result).toEqual({ success: true, jobId: JOB_ID })
    expect(inboxUpdateEqMock).toHaveBeenCalledWith('id', INBOX_ID)
  })
})

describe('rejectCollectorInboxItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    requireAdminWriteMock.mockResolvedValue({ denied: false })
    getAdminUsernameMock.mockResolvedValue('captain')
    inboxMaybeSingleMock.mockResolvedValue({
      data: {
        id: INBOX_ID,
        status: 'pending_niche',
        normalized_source_url: REEL_URL,
      },
      error: null,
    })
    inboxUpdateEqMock.mockResolvedValue({ error: null })
    auditInsertMock.mockResolvedValue({ data: null, error: null })
  })

  it('denies demo writes', async () => {
    requireAdminWriteMock.mockResolvedValueOnce({
      denied: true,
      error: 'Demo account is read-only. Sign in as admin to run this action.',
    })
    const { rejectCollectorInboxItem } = await import('@/app/actions/confirmCollectorInbox')
    const result = await rejectCollectorInboxItem(INBOX_ID)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toMatch(/Demo/)
    }
  })

  it('marks a pending reel invalid so it leaves Unsorted cargo', async () => {
    const { rejectCollectorInboxItem } = await import('@/app/actions/confirmCollectorInbox')
    const result = await rejectCollectorInboxItem(INBOX_ID)
    expect(result).toEqual({ success: true })
    expect(inboxUpdateEqMock).toHaveBeenCalled()
    expect(auditInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'collector_inbox_rejected',
        target_id: INBOX_ID,
      }),
    )
  })

  it('refuses rows that are no longer pending', async () => {
    inboxMaybeSingleMock.mockResolvedValue({
      data: { id: INBOX_ID, status: 'queued', normalized_source_url: REEL_URL },
      error: null,
    })
    const { rejectCollectorInboxItem } = await import('@/app/actions/confirmCollectorInbox')
    const result = await rejectCollectorInboxItem(INBOX_ID)
    expect(result).toEqual({
      success: false,
      error: 'This reel is no longer waiting for a niche.',
    })
  })
})
