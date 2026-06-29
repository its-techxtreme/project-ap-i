import { EmptyState } from '@/components/app/EmptyState'

export default function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <EmptyState
        title="System settings"
        description="System configuration will be managed here in a later phase."
      />
    </div>
  )
}
