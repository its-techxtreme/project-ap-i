import { createClient } from '@/lib/supabase/server'

export async function getUserRole(): Promise<'submitter' | 'admin' | null> {
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
  return data.role as 'submitter' | 'admin'
}
