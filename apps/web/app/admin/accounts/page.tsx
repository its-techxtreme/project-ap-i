import { EmptyState } from '@/components/app/EmptyState'

export default function AdminAccountsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
      <EmptyState
        title="Platform accounts"
        description="Account health and mapping management will appear here in Phase 5."
      />
    </div>
  )
}
