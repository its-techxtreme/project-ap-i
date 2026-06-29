import { AppShell } from '@/components/app/AppShell'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { createClient } from '@/lib/supabase/server'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <AppShell email={user?.email} variant="admin">
      {children}
    </AppShell>
  )
}
