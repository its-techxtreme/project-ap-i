import { describe, expect, it, beforeEach, afterEach } from 'vitest'

import { hashPassword, safeEqualString, verifyPassword } from '@/lib/auth/password'
import {
  createAdminSessionToken,
  verifyAdminSessionToken,
} from '@/lib/auth/adminSession'

describe('password hashing', () => {
  it('hashes and verifies with scrypt', () => {
    const hash = hashPassword('test-password-NotReal!')
    expect(hash.startsWith('scrypt$')).toBe(true)
    expect(verifyPassword('test-password-NotReal!', hash)).toBe(true)
    expect(verifyPassword('wrong', hash)).toBe(false)
  })

  it('rejects malformed hashes', () => {
    expect(verifyPassword('x', 'not-a-hash')).toBe(false)
    expect(verifyPassword('x', 'scrypt$1$1$1$bad$bad')).toBe(false)
  })

  it('safeEqualString compares usernames', () => {
    expect(safeEqualString('test-admin', 'test-admin')).toBe(true)
    expect(safeEqualString('test-admin', 'other')).toBe(false)
  })
})

describe('admin session tokens', () => {
  const prev = process.env.ADMIN_SESSION_SECRET

  beforeEach(() => {
    process.env.ADMIN_SESSION_SECRET = 'test-admin-session-secret-min-32-chars!!'
  })

  afterEach(() => {
    process.env.ADMIN_SESSION_SECRET = prev
  })

  it('creates and verifies a signed session', async () => {
    const token = await createAdminSessionToken('test-admin')
    const payload = await verifyAdminSessionToken(token)
    expect(payload?.username).toBe('test-admin')
  })

  it('rejects tampered tokens', async () => {
    const token = await createAdminSessionToken('test-admin')
    const tampered = `${token.slice(0, -4)}xxxx`
    expect(await verifyAdminSessionToken(tampered)).toBeNull()
  })

  it('rejects expired tokens', async () => {
    const past = Date.now() - 20 * 60 * 60 * 1000
    const token = await createAdminSessionToken('test-admin', 'admin', past)
    expect(await verifyAdminSessionToken(token)).toBeNull()
  })
})
