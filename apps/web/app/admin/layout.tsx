import { AppShell } from '@/components/app/AppShell'
import { getAdminUsername, getDashboardRole } from '@/lib/auth/getUserRole'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  const username = await getAdminUsername()
  const role = (await getDashboardRole()) ?? 'admin'

  return (
    <AppShell email={username} variant="admin" role={role}>
      {children}
    </AppShell>
  )
}
