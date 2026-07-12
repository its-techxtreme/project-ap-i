import { redirect } from 'next/navigation'
import { getUserRole } from './getUserRole'

/**
 * Page-level gate: admin and demo can view the dashboard.
 * Redirects to /login if not authenticated, forbidden if submitter-only.
 */
export async function requireAdmin() {
  const role = await getUserRole()
  if (role === null) redirect('/login')
  if (role !== 'admin' && role !== 'demo') redirect('/?error=forbidden')
}

/**
 * Mutation gate: only full admin can run retry/delete/cancel/account actions.
 */
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
