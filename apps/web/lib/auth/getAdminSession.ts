import { cookies } from 'next/headers'

import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from './adminSession'

export async function getAdminSession(): Promise<{ username: string } | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value
  const payload = await verifyAdminSessionToken(token)
  if (!payload) return null
  return { username: payload.username }
}
