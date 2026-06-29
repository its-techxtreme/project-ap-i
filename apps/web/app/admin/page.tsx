import { EmptyState } from '@/components/app/EmptyState'

export default function AdminOverviewPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">Admin dashboard overview — Phase 5+.</p>
      </div>
      <EmptyState
        title="No dashboard data yet"
        description="Job metrics and operational cards will appear in a later phase."
      />
    </div>
  )
}
