import { getAdminSession } from './getAdminSession'
import { createClient } from '@/lib/supabase/server'

export type AppRole = 'submitter' | 'admin' | 'demo'

/**
 * Returns the effective role for the current request.
 * Env-based dashboard sessions are the admin/demo path.
 */
export async function getUserRole(): Promise<AppRole | null> {
  const session = await getAdminSession()
  if (session?.role === 'admin') return 'admin'
  if (session?.role === 'demo') return 'demo'

  // Optional Supabase Auth for non-admin profiles (legacy). Admins must use username login.
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (error || !data) return null
    if (data.role === 'admin') return null
    if (data.role === 'submitter') return 'submitter'
    return null
  } catch {
    return null
  }
}

export async function getAdminUsername(): Promise<string | null> {
  const session = await getAdminSession()
  return session?.username ?? null
}

export async function getDashboardRole(): Promise<'admin' | 'demo' | null> {
  const session = await getAdminSession()
  return session?.role ?? null
}
