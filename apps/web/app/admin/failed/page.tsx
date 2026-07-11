import { FailedJobsTable } from '@/components/admin/FailedJobsTable'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getFailedJobs } from '@/lib/data/adminQueries'

export default async function AdminFailedPage() {
  await requireAdmin()
  const jobs = await getFailedJobs()

  return (
    <div className="space-y-4 animate-enter">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Failed Review</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Failed and needs-manual-review jobs · auto-refresh 45s
        </p>
      </div>
      <FailedJobsTable jobs={jobs} />
    </div>
  )
}
