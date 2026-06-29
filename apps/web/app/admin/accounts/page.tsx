import { AccountsTable } from '@/components/admin/AccountsTable'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getPlatformAccounts } from '@/lib/data/adminQueries'

export default async function AdminAccountsPage() {
  await requireAdmin()
  const accounts = await getPlatformAccounts()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
        <p className="text-sm text-muted-foreground">Platform account health and login status.</p>
      </div>
      <AccountsTable accounts={accounts} />
    </div>
  )
}
