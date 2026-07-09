import { beforeEach, describe, expect, it, vi } from 'vitest'

const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`)
})

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}))

const cookiesSetMock = vi.fn()
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ 'x-forwarded-for': '203.0.113.10' })),
  cookies: vi.fn(async () => ({
    set: cookiesSetMock,
    get: vi.fn(),
  })),
}))

const isLoginLockedMock = vi.fn()
const recordLoginAttemptMock = vi.fn()
const verifyAdminCredentialsMock = vi.fn()

vi.mock('@/lib/auth/adminCredentials', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/adminCredentials')>(
    '@/lib/auth/adminCredentials',
  )
  return {
    ...actual,
    isLoginLocked: (...args: unknown[]) => isLoginLockedMock(...args),
    recordLoginAttempt: (...args: unknown[]) => recordLoginAttemptMock(...args),
    verifyAdminCredentials: (...args: unknown[]) => verifyAdminCredentialsMock(...args),
  }
})

const auditInsertMock = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === 'audit_logs') return { insert: auditInsertMock }
      throw new Error(`Unexpected table ${table}`)
    },
  },
}))

describe('adminLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    process.env.ADMIN_SESSION_SECRET = 'test-admin-session-secret-min-32-chars!!'
    process.env.ADMIN_USERNAME = 'test-admin'
    process.env.ADMIN_PASSWORD_HASH = 'scrypt$16384$8$1$aaa$bbb'
    isLoginLockedMock.mockResolvedValue({ locked: false })
    recordLoginAttemptMock.mockResolvedValue(undefined)
    auditInsertMock.mockResolvedValue({ error: null })
  })

  it('rejects when locked out', async () => {
    isLoginLockedMock.mockResolvedValueOnce({ locked: true, reason: 'ip' })
    const { adminLogin } = await import('@/app/actions/adminLogin')
    const result = await adminLogin('test-admin', 'wrong')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.locked).toBe(true)
      expect(result.error).toMatch(/Too many failed attempts/)
    }
  })

  it('rejects invalid credentials and records failure', async () => {
    verifyAdminCredentialsMock.mockReturnValueOnce({ ok: false })
    const { adminLogin } = await import('@/app/actions/adminLogin')
    const result = await adminLogin('test-admin', 'wrong')
    expect(result).toEqual({ success: false, error: 'Invalid username or password.' })
    expect(recordLoginAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    )
  })

  it('sets session cookie and redirects on success', async () => {
    verifyAdminCredentialsMock.mockReturnValueOnce({ ok: true, username: 'test-admin' })
    const { adminLogin } = await import('@/app/actions/adminLogin')
    await expect(adminLogin('test-admin', 'ok', '/admin/jobs')).rejects.toThrow(
      'REDIRECT:/admin/jobs',
    )
    expect(cookiesSetMock).toHaveBeenCalledWith(
      'api_admin_session',
      expect.any(String),
      expect.objectContaining({ httpOnly: true }),
    )
    expect(recordLoginAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    )
  })
})
