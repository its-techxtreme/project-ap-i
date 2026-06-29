import { redirect } from 'next/navigation'
import { getUserRole } from './getUserRole'

/**
 * Use at the top of any admin Server Component or Server Action.
 * Redirects to /login if not authenticated, 403 page if not admin.
 */
export async function requireAdmin() {
  const role = await getUserRole()
  if (role === null) redirect('/login')
  if (role !== 'admin') redirect('/?error=forbidden')
}
