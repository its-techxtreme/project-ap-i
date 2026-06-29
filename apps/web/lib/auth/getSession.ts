import { createClient } from '@/lib/supabase/server'

export async function getSession() {
  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) return null

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()
  if (error) return null
  return session
}
