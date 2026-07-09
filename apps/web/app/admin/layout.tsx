import { AppShell } from '@/components/app/AppShell'
import { getAdminUsername } from '@/lib/auth/getUserRole'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  const username = await getAdminUsername()

  return (
    <AppShell email={username} variant="admin">
      {children}
    </AppShell>
  )
}
