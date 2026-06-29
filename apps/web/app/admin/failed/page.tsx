import { EmptyState } from '@/components/app/EmptyState'

export default function AdminFailedPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Failed Review</h1>
      <EmptyState
        title="Failed and manual review jobs"
        description="Failed jobs requiring attention will appear here in Phase 5."
      />
    </div>
  )
}
