import { beforeEach, describe, expect, it, vi } from 'vitest'

const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`)
})

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}))

const createClientMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => createClientMock(),
}))

function mockProfileRole(role: 'submitter' | 'admin' | null) {
  const single = vi.fn().mockResolvedValue(
    role
      ? { data: { role }, error: null }
      : { data: null, error: { message: 'not found' } },
  )

  createClientMock.mockResolvedValue({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: role ? { user: { id: 'user-1' } } : null },
        error: null,
      }),
      getUser: vi.fn().mockResolvedValue({
        data: { user: role ? { id: 'user-1' } : null },
        error: null,
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ single }),
      }),
    }),
  })
}

describe('getSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('returns null when no session exists', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      },
    })

    const { getSession } = await import('@/lib/auth/getSession')
    await expect(getSession()).resolves.toBeNull()
  })

  it('returns null when JWT validation fails even if a session cookie exists', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: 'invalid JWT' },
        }),
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: 'user-1' } } },
          error: null,
        }),
      },
    })

    const { getSession } = await import('@/lib/auth/getSession')
    await expect(getSession()).resolves.toBeNull()
  })
})

describe('getUserRole', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('returns null when user not authenticated', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
      from: vi.fn(),
    })

    const { getUserRole } = await import('@/lib/auth/getUserRole')
    await expect(getUserRole()).resolves.toBeNull()
  })

  it("returns 'submitter' for submitter profile", async () => {
    mockProfileRole('submitter')
    const { getUserRole } = await import('@/lib/auth/getUserRole')
    await expect(getUserRole()).resolves.toBe('submitter')
  })

  it("returns 'admin' for admin profile", async () => {
    mockProfileRole('admin')
    const { getUserRole } = await import('@/lib/auth/getUserRole')
    await expect(getUserRole()).resolves.toBe('admin')
  })
})

describe('requireAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('redirects to /login when user is null', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
      from: vi.fn(),
    })

    const { requireAdmin } = await import('@/lib/auth/requireAdmin')
    await expect(requireAdmin()).rejects.toThrow('REDIRECT:/login')
    expect(redirectMock).toHaveBeenCalledWith('/login')
  })

  it('redirects to /?error=forbidden when role is submitter', async () => {
    mockProfileRole('submitter')
    const { requireAdmin } = await import('@/lib/auth/requireAdmin')
    await expect(requireAdmin()).rejects.toThrow('REDIRECT:/?error=forbidden')
    expect(redirectMock).toHaveBeenCalledWith('/?error=forbidden')
  })

  it('does not redirect when role is admin', async () => {
    mockProfileRole('admin')
    const { requireAdmin } = await import('@/lib/auth/requireAdmin')
    await expect(requireAdmin()).resolves.toBeUndefined()
    expect(redirectMock).not.toHaveBeenCalled()
  })
})

describe('supabase/admin.ts browser guard', () => {
  it('throws when imported in a browser context', async () => {
    vi.stubGlobal('window', {} as Window)
    vi.resetModules()

    await expect(import('@/lib/supabase/admin')).rejects.toThrow(
      'SECURITY VIOLATION: supabase/admin.ts must only be used in server-side code.',
    )

    vi.unstubAllGlobals()
  })
})
