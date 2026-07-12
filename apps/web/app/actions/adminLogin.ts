'use server'

import { headers } from 'next/headers'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import {
  hashIp,
  isLoginLocked,
  normalizeUsername,
  recordLoginAttempt,
  verifyDashboardCredentials,
} from '@/lib/auth/adminCredentials'
import {
  ADMIN_SESSION_COOKIE,
  adminSessionCookieOptions,
  createAdminSessionToken,
} from '@/lib/auth/adminSession'
import { supabaseAdmin } from '@/lib/supabase/admin'

function clientIp(headerStore: Headers): string {
  const forwarded = headerStore.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return headerStore.get('x-real-ip')?.trim() || 'unknown'
}

export type AdminLoginResult =
  | { success: true }
  | { success: false; error: string; locked?: boolean }

export async function adminLogin(
  username: string,
  password: string,
  nextPath?: string | null,
): Promise<AdminLoginResult> {
  const headerStore = await headers()
  const ip = clientIp(headerStore)
  const ipHash = hashIp(ip)
  const usernameNorm = normalizeUsername(username)

  if (!usernameNorm || !password) {
    return { success: false, error: 'Username and password are required.' }
  }

  if (usernameNorm.length > 64 || password.length > 256) {
    return { success: false, error: 'Invalid credentials.' }
  }

  const lock = await isLoginLocked({ ipHash, usernameNorm })
  if (lock.locked) {
    await recordLoginAttempt({ ipHash, usernameNorm, success: false })
    return {
      success: false,
      locked: true,
      error: 'Too many failed attempts. Try again in 15 minutes.',
    }
  }

  const verified = verifyDashboardCredentials(username, password)
  if (!verified.ok) {
    await recordLoginAttempt({ ipHash, usernameNorm, success: false })
    await supabaseAdmin.from('audit_logs').insert({
      actor_type: 'anonymous',
      action: 'admin_login_failed',
      target_type: 'admin',
      metadata: { username_norm: usernameNorm, ip_hash: ipHash },
    })
    return { success: false, error: 'Invalid username or password.' }
  }

  await recordLoginAttempt({ ipHash, usernameNorm, success: true })

  const token = await createAdminSessionToken(verified.username, verified.role)
  const cookieStore = await cookies()
  cookieStore.set(ADMIN_SESSION_COOKIE, token, adminSessionCookieOptions())

  await supabaseAdmin.from('audit_logs').insert({
    actor_type: verified.role === 'demo' ? 'anonymous' : 'admin',
    action: verified.role === 'demo' ? 'demo_login' : 'admin_login',
    target_type: 'admin',
    metadata: { username: verified.username, role: verified.role, ip_hash: ipHash },
  })

  const dest = nextPath && nextPath.startsWith('/admin') ? nextPath : '/admin'
  redirect(dest)
}

export async function adminLogout(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(ADMIN_SESSION_COOKIE, '', { ...adminSessionCookieOptions(0), maxAge: 0 })
  redirect('/login')
}
