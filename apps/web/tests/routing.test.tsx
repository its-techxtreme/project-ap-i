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

const requireAdminMock = vi.fn()

vi.mock('@/lib/auth/requireAdmin', () => ({
  requireAdmin: () => requireAdminMock(),
}))

vi.mock('@/lib/auth/getUserRole', () => ({
  getAdminUsername: vi.fn().mockResolvedValue('test-admin'),
  getUserRole: vi.fn().mockResolvedValue('admin'),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }),
  },
}))

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({
    get: vi.fn(),
    set: vi.fn(),
  })),
}))

vi.mock('@/app/submit/SubmitForm', () => ({
  SubmitForm: () => <div data-testid="submit-form-stub">SubmitForm</div>,
}))

describe('/submit page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects legacy /submit to public home /', async () => {
    const SubmitPage = (await import('@/app/submit/page')).default
    try {
      await SubmitPage()
      expect.unreachable('expected redirect')
    } catch (err) {
      expect(String(err)).toContain('REDIRECT:/')
    }
    expect(redirectMock).toHaveBeenCalledWith('/')
  })
})

describe('/ page (public submit)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders public submit form without requiring a session', async () => {
    const HomePage = (await import('@/app/page')).default
    const ui = await HomePage({ searchParams: Promise.resolve({}) })
    render(ui)
    expect(screen.getByTestId('submit-form-stub')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Project AP-I' })).toBeTruthy()
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
    expect(badge.className).toContain('bg-emerald-500/15')
    expect(badge.className).toContain('text-emerald-400')
  })

  it("renders correct color class for 'failed'", async () => {
    const { StatusBadge } = await import('@/components/app/StatusBadge')
    render(<StatusBadge status="failed" />)
    const badge = screen.getByLabelText('Status: failed')
    expect(badge.className).toContain('bg-red-500/15')
    expect(badge.className).toContain('text-red-400')
  })

  it("renders correct color class for 'needs_manual_review'", async () => {
    const { StatusBadge } = await import('@/components/app/StatusBadge')
    render(<StatusBadge status="needs_manual_review" />)
    const badge = screen.getByLabelText('Status: needs manual review')
    expect(badge.className).toContain('bg-orange-500/15')
    expect(badge.className).toContain('text-orange-300')
  })
})
