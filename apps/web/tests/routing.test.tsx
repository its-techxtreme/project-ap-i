import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`)
})

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
  usePathname: () => '/admin',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

const getSessionMock = vi.fn()
const requireAdminMock = vi.fn()
const getUserRoleMock = vi.fn()

vi.mock('@/lib/auth/getSession', () => ({
  getSession: () => getSessionMock(),
}))

vi.mock('@/lib/auth/requireAdmin', () => ({
  requireAdmin: () => requireAdminMock(),
}))

vi.mock('@/lib/auth/getUserRole', () => ({
  getUserRole: () => getUserRoleMock(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { email: 'admin@example.com' } } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    }),
  }),
}))

vi.mock('@/app/submit/SubmitForm', () => ({
  SubmitForm: () => <div data-testid="submit-form-stub">SubmitForm</div>,
}))

describe('/submit page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls getSession() and redirects to /login if no session', async () => {
    getSessionMock.mockResolvedValue(null)
    const SubmitPage = (await import('@/app/submit/page')).default
    await expect(SubmitPage()).rejects.toThrow('REDIRECT:/login')
    expect(getSessionMock).toHaveBeenCalled()
    expect(redirectMock).toHaveBeenCalledWith('/login')
  })
})

describe('/admin layout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls requireAdmin() before rendering any content', async () => {
    requireAdminMock.mockResolvedValue(undefined)
    const AdminLayout = (await import('@/app/admin/layout')).default
    await AdminLayout({ children: <div>child</div> })
    expect(requireAdminMock).toHaveBeenCalled()
  })

  it('a submitter session cannot load admin layout data', async () => {
    requireAdminMock.mockImplementation(() => {
      redirectMock('/?error=forbidden')
    })

    const AdminLayout = (await import('@/app/admin/layout')).default
    await expect(AdminLayout({ children: <div>child</div> })).rejects.toThrow(
      'REDIRECT:/?error=forbidden',
    )
  })
})

describe('StatusBadge', () => {
  it("renders correct color class for 'completed'", async () => {
    const { StatusBadge } = await import('@/components/app/StatusBadge')
    render(<StatusBadge status="completed" />)
    const badge = screen.getByLabelText('Status: completed')
    expect(badge.className).toContain('bg-green-100')
    expect(badge.className).toContain('text-green-700')
  })

  it("renders correct color class for 'failed'", async () => {
    const { StatusBadge } = await import('@/components/app/StatusBadge')
    render(<StatusBadge status="failed" />)
    const badge = screen.getByLabelText('Status: failed')
    expect(badge.className).toContain('bg-red-100')
    expect(badge.className).toContain('text-red-700')
  })

  it("renders correct color class for 'needs_manual_review'", async () => {
    const { StatusBadge } = await import('@/components/app/StatusBadge')
    render(<StatusBadge status="needs_manual_review" />)
    const badge = screen.getByLabelText('Status: needs manual review')
    expect(badge.className).toContain('bg-orange-100')
    expect(badge.className).toContain('text-orange-700')
  })
})
