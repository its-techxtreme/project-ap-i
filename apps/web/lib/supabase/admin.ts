// service role. server only. the throw below is the tripwire
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

if (typeof window !== 'undefined') {
  throw new Error(
    'SECURITY VIOLATION: supabase/admin.ts must only be used in server-side code.',
  )
}

export const supabaseAdmin = createSupabaseClient(
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)
