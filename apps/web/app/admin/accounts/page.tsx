import { AccountsTable } from '@/components/admin/AccountsTable'
import { DeskPageHeader } from '@/components/desk/DeskPageHeader'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getPlatformAccounts } from '@/lib/data/adminQueries'

export default async function AdminAccountsPage() {
  await requireAdmin()
  const accounts = await getPlatformAccounts()

  return (
    <div className="space-y-4 animate-enter">
      <DeskPageHeader
        kicker="Crew roster"
        title="Crew accounts"
        description="Platform account health and login status for Memes, Anime, and Sports sea lanes."
        meta={
          <span className="rounded-md border border-border/70 bg-card/50 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">
            {accounts.length} mapped
          </span>
        }
      />
      <AccountsTable accounts={accounts} />
    </div>
  )
}
