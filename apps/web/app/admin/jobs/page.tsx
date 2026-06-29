import { Suspense } from 'react'

import { JobFilters } from '@/components/admin/JobFilters'
import { JobsTable } from '@/components/admin/JobsTable'
import { Pagination } from '@/components/admin/Pagination'
import { LoadingState } from '@/components/app/LoadingState'
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
    dateFrom: typeof searchParams.dateFrom === 'string' ? searchParams.dateFrom : undefined,
    dateTo: typeof searchParams.dateTo === 'string' ? searchParams.dateTo : undefined,
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
        <p className="text-sm text-muted-foreground">
          All submitted jobs with filters and pagination. Auto-refreshes every 45 seconds.
        </p>
      </div>

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
