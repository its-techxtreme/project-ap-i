import { EmptyState } from '@/components/app/EmptyState'

export default function AdminLogsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Logs</h1>
      <EmptyState
        title="Audit and job event logs"
        description="Operational logs will appear here in Phase 5."
      />
    </div>
  )
}
