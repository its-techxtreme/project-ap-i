import { FailedJobsTable } from '@/components/admin/FailedJobsTable'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getFailedJobs } from '@/lib/data/adminQueries'

export default async function AdminFailedPage() {
  await requireAdmin()
  const jobs = await getFailedJobs()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Failed Review</h1>
        <p className="text-sm text-muted-foreground">
          Jobs in failed or needs manual review status.
        </p>
      </div>
      <FailedJobsTable jobs={jobs} />
    </div>
  )
}
