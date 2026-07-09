import { describe, expect, it, vi } from 'vitest'

const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`)
})

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}))

describe('web security checklist', () => {
  it('supabase admin client throws if imported in browser context', async () => {
    const originalWindow = global.window
    // @ts-expect-error simulate browser global
    global.window = {}

    vi.resetModules()
    await expect(import('@/lib/supabase/admin')).rejects.toThrow(/SECURITY VIOLATION/)

    global.window = originalWindow
  })

  it('admin pages call requireAdmin() before any data fetch', async () => {
    const requireAdminMock = vi.fn(() => {
      redirectMock('/?error=forbidden')
    })
    vi.doMock('@/lib/auth/requireAdmin', () => ({
      requireAdmin: requireAdminMock,
    }))

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

  it('submit action does not accept target_account_id from form', async () => {
    const { SubmitJobSchema } = await import('@project-api/shared')
    const parsed = SubmitJobSchema.safeParse({
      sourceUrl: 'https://www.youtube.com/shorts/test123',
      sourcePlatform: 'youtube',
      nicheId: '11111111-1111-4111-8111-111111111111',
      rightsConfirmed: true,
      targetAccountId: 'malicious-account-id',
    })

    expect(parsed.success).toBe(false)
  })

  it('NEXT_PUBLIC env vars do not include service role key name', () => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('NEXT_PUBLIC_')) {
        expect(key).not.toMatch(/SERVICE_ROLE/)
        expect(key).not.toMatch(/ADMIN_PASSWORD/)
        expect(key).not.toMatch(/SESSION_SECRET/)
      }
    }
  })

  it('admin password helpers never expose plaintext env on client modules', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const loginForm = fs.readFileSync(
      path.join(process.cwd(), 'components/app/LoginForm.tsx'),
      'utf8',
    )
    expect(loginForm).not.toMatch(/ADMIN_PASSWORD/)
    expect(loginForm).toMatch(/adminLogin/)
    expect(loginForm).toMatch(/Username/)
  })
})
