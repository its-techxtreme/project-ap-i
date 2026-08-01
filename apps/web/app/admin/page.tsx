import { AdminAutoRefresh } from '@/components/admin/AdminAutoRefresh'
import { ActivityFeed } from '@/components/desk/ActivityFeed'
import { AlertStrip } from '@/components/desk/AlertStrip'
import { DeskPageHeader } from '@/components/desk/DeskPageHeader'
import { DeskPanel } from '@/components/desk/DeskPanel'
import { MetricTileGrid } from '@/components/desk/MetricTileGrid'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getJobSummary, getRecentJobEvents } from '@/lib/data/adminQueries'

export default async function AdminOverviewPage() {
  await requireAdmin()
  const [summary, recentEvents] = await Promise.all([getJobSummary(), getRecentJobEvents(12)])

  return (
    <div className="space-y-5 animate-enter">
      <AdminAutoRefresh />
      <DeskPageHeader
        kicker="Crow's nest"
        title="Voyage overview"
        description="Live cargo metrics and the event stream. Auto-refreshes every 45 seconds."
        meta={
          <div className="rounded-md border border-border/70 bg-card/60 px-3 py-2 font-mono text-[11px] text-muted-foreground">
            <span className="mr-2 inline-block size-1.5 rounded-full bg-primary status-live" aria-hidden />
            WATCH ONLINE
          </div>
        }
      />

      <AlertStrip summary={summary} />
      <MetricTileGrid summary={summary} />

      <DeskPanel
        eyebrow="Signal flags"
        title="Recent activity"
        action={
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            last 12
          </span>
        }
      >
        <ActivityFeed events={recentEvents} embedded />
      </DeskPanel>
    </div>
  )
}
