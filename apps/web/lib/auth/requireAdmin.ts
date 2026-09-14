import { redirect } from 'next/navigation'
import { getUserRole } from './getUserRole'

/** Dashboard pages. Demo can look. Submitters bounce. */
export async function requireAdmin() {
  const role = await getUserRole()
  if (role === null) redirect('/login')
  if (role !== 'admin' && role !== 'demo') redirect('/?error=forbidden')
}

/** Writes. Demo gets denied. */
export async function requireAdminWrite() {
  const role = await getUserRole()
  if (role === null) redirect('/login')
  if (role !== 'admin') {
    return {
      denied: true as const,
      error: 'Demo account is read-only. Sign in as admin to run this action.',
    }
  }
  return { denied: false as const }
}
