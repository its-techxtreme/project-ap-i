import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireAdminWriteMock =
  vi.fn<() => Promise<{ denied: false } | { denied: true; error: string }>>()
const getAdminUsernameMock = vi.fn<() => Promise<string | null>>()
const upsertMock = vi.fn()
const auditInsertMock = vi.fn()

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/requireAdmin', () => ({
  requireAdminWrite: () => requireAdminWriteMock(),
}))
vi.mock('@/lib/auth/getUserRole', () => ({
  getAdminUsername: () => getAdminUsernameMock(),
}))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === 'system_settings') return { upsert: upsertMock }
      if (table === 'audit_logs') return { insert: auditInsertMock }
      throw new Error(`Unexpected table: ${table}`)
    },
  },
}))

describe('setCollectorArmed', () => {
  beforeEach(() => {
    requireAdminWriteMock.mockReset()
    getAdminUsernameMock.mockReset()
    upsertMock.mockReset()
    auditInsertMock.mockReset()
    requireAdminWriteMock.mockResolvedValue({ denied: false })
    getAdminUsernameMock.mockResolvedValue('admin')
    upsertMock.mockResolvedValue({ error: null })
    auditInsertMock.mockResolvedValue({ error: null })
  })

  it('upserts collector_armed for admins', async () => {
    const { setCollectorArmed } = await import('@/app/actions/setCollectorArmed')
    const result = await setCollectorArmed(false)
    expect(result).toEqual({ success: true, armed: false })
    expect(upsertMock).toHaveBeenCalled()
    expect(auditInsertMock).toHaveBeenCalled()
  })

  it('rejects demo writes', async () => {
    requireAdminWriteMock.mockResolvedValue({
      denied: true,
      error: 'Demo account is read-only. Sign in as admin to run this action.',
    })
    const { setCollectorArmed } = await import('@/app/actions/setCollectorArmed')
    const result = await setCollectorArmed(true)
    expect(result.success).toBe(false)
    expect(upsertMock).not.toHaveBeenCalled()
  })
})
