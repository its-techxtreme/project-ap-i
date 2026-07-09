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

const fetchMock = vi.fn()
const supabaseAdminInsertMock = vi.fn()
const supabaseAdminSelectMock = vi.fn()
const supabaseAdminEqMock = vi.fn()
const supabaseAdminSingleMock = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === 'jobs') {
        return {
          select: supabaseAdminSelectMock.mockReturnValue({
            eq: supabaseAdminEqMock.mockReturnValue({
              single: supabaseAdminSingleMock,
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }
      }
      if (table === 'audit_logs') {
        return { insert: supabaseAdminInsertMock }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  },
}))

global.fetch = fetchMock

describe('Phase 14 dry run — web/admin scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()

    process.env.WORKER_BASE_URL = 'http://localhost:3001'
    process.env.WORKER_INTERNAL_TOKEN = 'test-worker-internal-token-min-32-chars'
    process.env.REAL_UPLOADS_ENABLED = 'false'

    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true, driveFileId: 'mock-drive-id' }),
    })

    supabaseAdminEqMock.mockReturnValue({ single: supabaseAdminSingleMock })
    supabaseAdminSingleMock.mockResolvedValue({
      data: {
        id: 'job-manual-review-1',
        status: 'needs_manual_review',
        drive_file_id: 'mock-drive-id',
        drive_deleted_at: null,
        drive_folder_state: 'processed_ready',
        youtube_retry_count: 2,
        instagram_retry_count: 2,
      },
      error: null,
    })
    supabaseAdminInsertMock.mockResolvedValue({ error: null })
  })

  it('Scenario 6: admin delete Drive file writes audit log and calls worker endpoint', async () => {
    requireAdminMock.mockResolvedValue(undefined)

    const { deleteDriveFile } = await import('@/app/actions/adminActions')
    const result = await deleteDriveFile('job-manual-review-1')

    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/jobs/job-manual-review-1/delete-drive-file',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Worker-Token': 'test-worker-internal-token-min-32-chars',
        }),
      }),
    )
    expect(supabaseAdminInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_type: 'admin',
        action: 'drive_delete_requested',
        target_type: 'job',
        target_id: 'job-manual-review-1',
      }),
    )
  })

  it('Scenario 6: admin delete requires confirmation path via server action guard', async () => {
    requireAdminMock.mockRejectedValueOnce(new Error('REDIRECT:/?error=forbidden'))

    const { deleteDriveFile } = await import('@/app/actions/adminActions')
    await expect(deleteDriveFile('job-manual-review-1')).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('Scenario 7: submitter cannot access admin jobs page (server-side redirect)', async () => {
    requireAdminMock.mockImplementation(() => {
      redirectMock('/?error=forbidden')
    })

    const getJobsMock = vi.fn()
    vi.doMock('@/lib/data/adminQueries', () => ({
      getJobs: getJobsMock,
      getJobSummary: vi.fn(),
      getRecentJobEvents: vi.fn(),
      getFailedJobs: vi.fn(),
      getPlatformAccounts: vi.fn(),
      getActiveNiches: vi.fn(),
    }))
    vi.doMock('@/components/admin/JobsTable', () => ({ JobsTable: () => null }))
    vi.doMock('@/components/admin/JobFilters', () => ({ JobFilters: () => null }))
    vi.doMock('@/components/admin/Pagination', () => ({ Pagination: () => null }))

    const AdminJobsPage = (await import('@/app/admin/jobs/page')).default
    await expect(AdminJobsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'REDIRECT:/?error=forbidden',
    )
    expect(requireAdminMock).toHaveBeenCalled()
    expect(getJobsMock).not.toHaveBeenCalled()
  })

  it('Scenario 7: submitter cannot access admin overview page', async () => {
    requireAdminMock.mockImplementation(() => {
      redirectMock('/?error=forbidden')
    })

    const getJobSummaryMock = vi.fn()
    vi.doMock('@/lib/data/adminQueries', () => ({
      getJobSummary: getJobSummaryMock,
      getRecentJobEvents: vi.fn(),
      getJobs: vi.fn(),
      getFailedJobs: vi.fn(),
      getPlatformAccounts: vi.fn(),
      getActiveNiches: vi.fn(),
    }))
    vi.doMock('@/components/admin/OverviewCards', () => ({ OverviewCards: () => null }))
    vi.doMock('@/components/admin/RecentActivityTimeline', () => ({ RecentActivityTimeline: () => null }))
    vi.doMock('@/components/admin/AdminAutoRefresh', () => ({ AdminAutoRefresh: () => null }))

    const AdminOverviewPage = (await import('@/app/admin/page')).default
    await expect(AdminOverviewPage()).rejects.toThrow('REDIRECT:/?error=forbidden')
    expect(getJobSummaryMock).not.toHaveBeenCalled()
  })

  it('REAL_UPLOADS_ENABLED is false in web dry run environment', () => {
    expect(process.env.REAL_UPLOADS_ENABLED).toBe('false')
  })

  it('no service role key exposed in NEXT_PUBLIC env vars', () => {
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith('NEXT_PUBLIC_')) {
        expect(value).not.toMatch(/service.?role/i)
        expect(key).not.toMatch(/SERVICE_ROLE/i)
      }
    }
  })
})
