import { getAdminSession } from './getAdminSession'
import { createClient } from '@/lib/supabase/server'

/**
 * Returns the effective role for the current request.
 * Env-based admin username sessions are the only admin path.
 */
export async function getUserRole(): Promise<'submitter' | 'admin' | null> {
  const admin = await getAdminSession()
  if (admin) return 'admin'

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
    return data.role as 'submitter' | 'admin'
  } catch {
    return null
  }
}

export async function getAdminUsername(): Promise<string | null> {
  const session = await getAdminSession()
  return session?.username ?? null
}
