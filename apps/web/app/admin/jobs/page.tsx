import { Suspense } from 'react'

import { JobFilters } from '@/components/admin/JobFilters'
import { JobsTable } from '@/components/admin/JobsTable'
import { Pagination } from '@/components/admin/Pagination'
import { LoadingState } from '@/components/app/LoadingState'
import { DeskPageHeader } from '@/components/desk/DeskPageHeader'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getActiveNiches, getJobs, type JobFilters as JobFiltersType } from '@/lib/data/adminQueries'

const PAGE_SIZE = 25

function parseFilters(searchParams: Record<string, string | string[] | undefined>): JobFiltersType {
  const statusParam = searchParams.status
  const status =
    typeof statusParam === 'string'
      ? statusParam.split(',').filter(Boolean)
      : Array.isArray(statusParam)
        ? statusParam.flatMap((value) => value.split(',')).filter(Boolean)
        : undefined

  return {
    status,
    nicheId: typeof searchParams.nicheId === 'string' ? searchParams.nicheId : undefined,
    sourcePlatform:
      typeof searchParams.sourcePlatform === 'string' ? searchParams.sourcePlatform : undefined,
    youtubeUploadStatus:
      typeof searchParams.youtubeUploadStatus === 'string'
        ? searchParams.youtubeUploadStatus
        : undefined,
    instagramUploadStatus:
      typeof searchParams.instagramUploadStatus === 'string'
        ? searchParams.instagramUploadStatus
        : undefined,
  }
}

export default async function AdminJobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireAdmin()
  const params = await searchParams
  const page = Math.max(1, Number(params.page ?? '1') || 1)
  const filters = parseFilters(params)

  const [{ jobs, total }, niches] = await Promise.all([
    getJobs(filters, page, PAGE_SIZE),
    getActiveNiches(),
  ])

  return (
    <div className="space-y-4 animate-enter">
      <DeskPageHeader
        kicker="Ship's log"
        title="Ship's log"
        description="Collector DMs and website submits land here. Pause, unpause, cancel, and retry from the actions column. Clip is the source video. Refreshes every 45s."
        meta={
          <span className="rounded-md border border-border/70 bg-card/50 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">
            {total} rows
          </span>
        }
      />

      <Suspense fallback={<LoadingState label="Loading filters…" />}>
        <JobFilters niches={niches} />
      </Suspense>

      <Suspense fallback={<LoadingState label="Loading table…" />}>
        <JobsTable jobs={jobs} />
      </Suspense>
      <Suspense fallback={null}>
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} />
      </Suspense>
    </div>
  )
}
