import { createHash } from 'node:crypto'

import { supabaseAdmin } from '@/lib/supabase/admin'

import type { DashboardRole } from './adminSession'
import { safeEqualString, verifyPassword } from './password'

export const LOGIN_WINDOW_MS = 15 * 60 * 1000
export const MAX_FAILURES_PER_IP = 5
export const MAX_FAILURES_PER_USERNAME = 10

/** One-click demo boarding — success-side throttle (separate from failure lockout). */
export const DEMO_LOGIN_WINDOW_MS = 60 * 60 * 1000
export const MAX_DEMO_SUCCESSES_PER_IP = 8

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase()
}

export function hashIp(ip: string): string {
  return createHash('sha256').update(`admin-login-ip:${ip}`).digest('hex')
}

export function getAdminCredentials(): { username: string; passwordHash: string } | null {
  const username = process.env.ADMIN_USERNAME?.trim()
  const passwordHash = process.env.ADMIN_PASSWORD_HASH?.trim()
  if (!username || !passwordHash) return null
  return { username, passwordHash }
}

export function getDemoCredentials(): { username: string; passwordHash: string } | null {
  const username = process.env.DEMO_USERNAME?.trim()
  const passwordHash = process.env.DEMO_PASSWORD_HASH?.trim()
  if (!username || !passwordHash) return null
  return { username, passwordHash }
}

export async function countRecentFailures(opts: {
  ipHash: string
  usernameNorm?: string
}): Promise<{ ipFailures: number; userFailures: number }> {
  const since = new Date(Date.now() - LOGIN_WINDOW_MS).toISOString()

  const ipQuery = supabaseAdmin
    .from('admin_login_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', opts.ipHash)
    .eq('success', false)
    .gte('created_at', since)

  const { count: ipCount } = await ipQuery

  let userCount = 0
  if (opts.usernameNorm) {
    const { count } = await supabaseAdmin
      .from('admin_login_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('username_norm', opts.usernameNorm)
      .eq('success', false)
      .gte('created_at', since)
    userCount = count ?? 0
  }

  return { ipFailures: ipCount ?? 0, userFailures: userCount }
}

export async function isLoginLocked(opts: {
  ipHash: string
  usernameNorm?: string
}): Promise<{ locked: boolean; reason?: 'ip' | 'username' }> {
  const { ipFailures, userFailures } = await countRecentFailures(opts)
  if (ipFailures >= MAX_FAILURES_PER_IP) return { locked: true, reason: 'ip' }
  if (opts.usernameNorm && userFailures >= MAX_FAILURES_PER_USERNAME) {
    return { locked: true, reason: 'username' }
  }
  return { locked: false }
}

/** Cap demo one-click logins per IP so people dont flood audit_logs. */
export async function isDemoLoginRateLimited(ipHash: string): Promise<boolean> {
  const demo = getDemoCredentials()
  if (!demo) return true

  const since = new Date(Date.now() - DEMO_LOGIN_WINDOW_MS).toISOString()
  const usernameNorm = normalizeUsername(demo.username)
  const { count } = await supabaseAdmin
    .from('admin_login_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .eq('username_norm', usernameNorm)
    .eq('success', true)
    .gte('created_at', since)

  return (count ?? 0) >= MAX_DEMO_SUCCESSES_PER_IP
}

export async function recordLoginAttempt(opts: {
  ipHash: string
  usernameNorm: string | null
  success: boolean
}): Promise<void> {
  await supabaseAdmin.from('admin_login_attempts').insert({
    ip_hash: opts.ipHash,
    username_norm: opts.usernameNorm,
    success: opts.success,
  })
}

type VerifyOk = { ok: true; username: string; role: DashboardRole }
type VerifyFail = { ok: false }

/** Check admin or demo env creds. Always hash-work if a hash exists so timing stays even. */
export function verifyDashboardCredentials(username: string, password: string): VerifyOk | VerifyFail {
  const admin = getAdminCredentials()
  const demo = getDemoCredentials()
  if (!admin && !demo) return { ok: false }

  const inputNorm = normalizeUsername(username)

  // Timing hardening: always verify against whichever hashes exist.
  const adminUserOk = admin
    ? safeEqualString(inputNorm, normalizeUsername(admin.username))
    : false
  const adminPassOk = admin ? verifyPassword(password, admin.passwordHash) : false

  const demoUserOk = demo ? safeEqualString(inputNorm, normalizeUsername(demo.username)) : false
  const demoPassOk = demo ? verifyPassword(password, demo.passwordHash) : false

  // Prefer admin if both somehow match (misconfigured identical users).
  if (admin && adminUserOk && adminPassOk) {
    return { ok: true, username: admin.username, role: 'admin' }
  }
  if (demo && demoUserOk && demoPassOk) {
    return { ok: true, username: demo.username, role: 'demo' }
  }
  return { ok: false }
}

/** @deprecated Use verifyDashboardCredentials */
export function verifyAdminCredentials(
  username: string,
  password: string,
): { ok: true; username: string } | { ok: false } {
  const result = verifyDashboardCredentials(username, password)
  if (!result.ok || result.role !== 'admin') return { ok: false }
  return { ok: true, username: result.username }
}
