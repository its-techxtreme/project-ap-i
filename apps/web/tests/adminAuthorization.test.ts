import { beforeEach, describe, expect, it, vi } from 'vitest'

const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`)
})

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}))

const requireAdminMock = vi.fn()
vi.mock('@/lib/auth/requireAdmin', () => ({
  requireAdmin: () => requireAdminMock(),
}))

const getJobSummaryMock = vi.fn()
const getRecentJobEventsMock = vi.fn()
const getJobsMock = vi.fn()
const getFailedJobsMock = vi.fn()
const getPlatformAccountsMock = vi.fn()

vi.mock('@/lib/data/adminQueries', () => ({
  getJobSummary: (...args: unknown[]) => getJobSummaryMock(...args),
  getRecentJobEvents: (...args: unknown[]) => getRecentJobEventsMock(...args),
  getJobs: (...args: unknown[]) => getJobsMock(...args),
  getFailedJobs: (...args: unknown[]) => getFailedJobsMock(...args),
  getPlatformAccounts: (...args: unknown[]) => getPlatformAccountsMock(...args),
  getActiveNiches: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/components/admin/OverviewCards', () => ({
  OverviewCards: () => null,
}))
vi.mock('@/components/admin/RecentActivityTimeline', () => ({
  RecentActivityTimeline: () => null,
}))
vi.mock('@/components/admin/AdminAutoRefresh', () => ({
  AdminAutoRefresh: () => null,
}))
vi.mock('@/components/admin/JobsTable', () => ({
  JobsTable: () => null,
}))
vi.mock('@/components/admin/JobFilters', () => ({
  JobFilters: () => null,
}))
vi.mock('@/components/admin/Pagination', () => ({
  Pagination: () => null,
}))
vi.mock('@/components/admin/FailedJobsTable', () => ({
  FailedJobsTable: () => null,
}))
vi.mock('@/components/admin/AccountsTable', () => ({
  AccountsTable: () => null,
}))

describe('admin page authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    getJobSummaryMock.mockResolvedValue({
      queued: 0,
      processing: 0,
      completedToday: 0,
      failedToday: 0,
      needsManualReview: 0,
      loginRequiredAccounts: 0,
      driveWaitingCleanup: 0,
    })
    getRecentJobEventsMock.mockResolvedValue([])
    getJobsMock.mockResolvedValue({ jobs: [], total: 0 })
    getFailedJobsMock.mockResolvedValue([])
    getPlatformAccountsMock.mockResolvedValue([])
  })

  it('overview page calls requireAdmin() and redirects submitters', async () => {
    requireAdminMock.mockImplementation(() => {
      redirectMock('/?error=forbidden')
    })

    const AdminOverviewPage = (await import('@/app/admin/page')).default
    await expect(AdminOverviewPage()).rejects.toThrow('REDIRECT:/?error=forbidden')
    expect(requireAdminMock).toHaveBeenCalled()
    expect(getJobSummaryMock).not.toHaveBeenCalled()
  })

  it('jobs page calls requireAdmin() and redirects submitters', async () => {
    requireAdminMock.mockImplementation(() => {
      redirectMock('/?error=forbidden')
    })

    const AdminJobsPage = (await import('@/app/admin/jobs/page')).default
    await expect(AdminJobsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'REDIRECT:/?error=forbidden',
    )
    expect(requireAdminMock).toHaveBeenCalled()
    expect(getJobsMock).not.toHaveBeenCalled()
  })

  it('failed page calls requireAdmin() and redirects submitters', async () => {
    requireAdminMock.mockImplementation(() => {
      redirectMock('/?error=forbidden')
    })

    const AdminFailedPage = (await import('@/app/admin/failed/page')).default
    await expect(AdminFailedPage()).rejects.toThrow('REDIRECT:/?error=forbidden')
    expect(requireAdminMock).toHaveBeenCalled()
    expect(getFailedJobsMock).not.toHaveBeenCalled()
  })

  it('accounts page calls requireAdmin() and redirects submitters', async () => {
    requireAdminMock.mockImplementation(() => {
      redirectMock('/?error=forbidden')
    })

    const AdminAccountsPage = (await import('@/app/admin/accounts/page')).default
    await expect(AdminAccountsPage()).rejects.toThrow('REDIRECT:/?error=forbidden')
    expect(requireAdminMock).toHaveBeenCalled()
    expect(getPlatformAccountsMock).not.toHaveBeenCalled()
  })

  it('overview page fetches data only after requireAdmin passes', async () => {
    requireAdminMock.mockResolvedValue(undefined)

    const AdminOverviewPage = (await import('@/app/admin/page')).default
    await AdminOverviewPage()
    expect(requireAdminMock).toHaveBeenCalled()
    expect(getJobSummaryMock).toHaveBeenCalled()
  })
})
