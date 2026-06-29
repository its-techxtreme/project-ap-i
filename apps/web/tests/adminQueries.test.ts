import { beforeEach, describe, expect, it, vi } from 'vitest'

const fromMock = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...args) },
}))

function createThenableChain() {
  const result = { count: 0, error: null }
  const chain: Record<string, unknown> = {
    then(onFulfilled: (value: typeof result) => unknown) {
      return Promise.resolve(result).then(onFulfilled)
    },
  }

  for (const method of ['eq', 'in', 'gte', 'or', 'not', 'is', 'neq'] as const) {
    chain[method] = vi.fn().mockImplementation(() => chain)
  }

  return chain
}

function createJobsListChain() {
  const rangeMock = vi.fn().mockResolvedValue({ data: [], error: null, count: 0 })
  const orderMock = vi.fn().mockReturnValue({ range: rangeMock })
  const lteMock = vi.fn().mockReturnThis()
  const chain = {
    in: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: lteMock,
    order: orderMock,
  }
  fromMock.mockReturnValue({
    select: vi.fn().mockReturnValue(chain),
  })
  return { lteMock }
}

function mockCountQuery() {
  const select = vi.fn().mockReturnValue(createThenableChain())
  fromMock.mockReturnValue({ select })
  return { select }
}

describe('adminQueries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('getJobSummary uses supabaseAdmin client', async () => {
    mockCountQuery()

    const { getJobSummary } = await import('@/lib/data/adminQueries')
    await getJobSummary()

    expect(fromMock).toHaveBeenCalledWith('jobs')
    expect(fromMock).toHaveBeenCalledWith('platform_accounts')
  })

  it('getJobs applies status filter', async () => {
    const inMock = vi.fn().mockReturnThis()
    const { lteMock } = createJobsListChain()
    const inChain = {
      in: inMock,
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: lteMock,
      order: vi.fn().mockReturnValue({
        range: vi.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
      }),
    }
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnValue(inChain),
    })

    const { getJobs } = await import('@/lib/data/adminQueries')
    await getJobs({ status: ['queued', 'failed'] }, 1, 25)

    expect(inMock).toHaveBeenCalledWith('status', ['queued', 'failed'])
  })

  it('getJobs uses inclusive end-of-day for dateTo filter', async () => {
    const { lteMock } = createJobsListChain()

    const { getJobs } = await import('@/lib/data/adminQueries')
    await getJobs({ dateTo: '2026-06-29' }, 1, 25)

    expect(lteMock).toHaveBeenCalledWith('created_at', '2026-06-29T23:59:59.999Z')
  })

  it('getFailedJobs returns only failed and needs_manual_review statuses', async () => {
    const inMock = vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    })
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnValue({ in: inMock }),
    })

    const { getFailedJobs } = await import('@/lib/data/adminQueries')
    await getFailedJobs()

    expect(inMock).toHaveBeenCalledWith('status', ['failed', 'needs_manual_review'])
  })
})
