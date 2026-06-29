import { EmptyState } from '@/components/app/EmptyState'

export default function AdminJobsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
      <EmptyState title="Jobs table" description="All jobs will be listed here in Phase 5." />
    </div>
  )
}
