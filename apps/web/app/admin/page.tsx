import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getJobSummary, getRecentJobEvents } from '@/lib/data/adminQueries'

import { AdminAutoRefresh } from '@/components/admin/AdminAutoRefresh'
import { OverviewCards } from '@/components/admin/OverviewCards'
import { RecentActivityTimeline } from '@/components/admin/RecentActivityTimeline'

export default async function AdminOverviewPage() {
  await requireAdmin()
  const [summary, recentEvents] = await Promise.all([getJobSummary(), getRecentJobEvents(10)])

  return (
    <div className="space-y-6">
      <AdminAutoRefresh />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Operational metrics and recent pipeline activity. Auto-refreshes every 45 seconds.
        </p>
      </div>

      <OverviewCards summary={summary} />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recent activity</h2>
        <RecentActivityTimeline events={recentEvents} />
      </section>
    </div>
  )
}
