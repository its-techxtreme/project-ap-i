import { FailedJobsTable } from '@/components/admin/FailedJobsTable'
import { DeskPageHeader } from '@/components/desk/DeskPageHeader'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getFailedJobs } from '@/lib/data/adminQueries'

export default async function AdminFailedPage() {
  await requireAdmin()
  const jobs = await getFailedJobs()

  return (
    <div className="space-y-4 animate-enter">
      <DeskPageHeader
        kicker="Boarding party"
        title="Lost cargo"
        description="Failed and needs-manual-review jobs. Clear Drive leftovers here before striking records from the log."
        meta={
          <span className="rounded-md border border-border/70 bg-card/50 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">
            {jobs.length} open
          </span>
        }
      />
      <FailedJobsTable jobs={jobs} />
    </div>
  )
}
