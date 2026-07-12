import { cookies } from 'next/headers'

import {
  ADMIN_SESSION_COOKIE,
  type DashboardRole,
  verifyAdminSessionToken,
} from './adminSession'
import { getAdminCredentials, normalizeUsername } from './adminCredentials'

export type AdminSession = {
  username: string
  role: DashboardRole
}

function resolveRole(
  payload: { username: string; role?: DashboardRole },
): DashboardRole | null {
  if (payload.role === 'admin' || payload.role === 'demo') return payload.role

  // Legacy tokens without role: only accept as admin if username matches ADMIN_USERNAME.
  const admin = getAdminCredentials()
  if (
    admin &&
    normalizeUsername(payload.username) === normalizeUsername(admin.username)
  ) {
    return 'admin'
  }
  return null
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value
  const payload = await verifyAdminSessionToken(token)
  if (!payload) return null
  const role = resolveRole(payload)
  if (!role) return null
  return { username: payload.username, role }
}
