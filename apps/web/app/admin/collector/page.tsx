import { CollectorInboxTable } from '@/components/admin/CollectorInboxTable'
import { DeskPageHeader } from '@/components/desk/DeskPageHeader'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getActiveNiches, getPendingCollectorInbox } from '@/lib/data/adminQueries'

export default async function AdminCollectorPage() {
  await requireAdmin()
  const [items, niches] = await Promise.all([getPendingCollectorInbox(), getActiveNiches()])

  return (
    <div className="space-y-4 animate-enter">
      <DeskPageHeader
        kicker="Boarding party"
        title="Unsorted cargo"
        description="Crew DMs that arrived without a niche. Watch the reel, pick Memes / Anime / Sports, then confirm to queue the job. Rights are assumed for collector DMs."
        meta={
          <span className="rounded-md border border-border/70 bg-card/50 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">
            {items.length} waiting
          </span>
        }
      />
      <CollectorInboxTable items={items} niches={niches} />
    </div>
  )
}
