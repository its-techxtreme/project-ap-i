import { Suspense } from 'react'

import { LogsTable } from '@/components/admin/LogsTable'
import { LoadingState } from '@/components/app/LoadingState'
import { DeskPageHeader } from '@/components/desk/DeskPageHeader'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import {
  getAuditLogs,
  getJobEventsForLogs,
  type LogFilters,
} from '@/lib/data/adminQueries'

const PAGE_SIZE = 25

function parseLogFilters(
  searchParams: Record<string, string | string[] | undefined>,
): LogFilters {
  return {
    jobId: typeof searchParams.jobId === 'string' ? searchParams.jobId : undefined,
    action: typeof searchParams.action === 'string' ? searchParams.action : undefined,
    eventType: typeof searchParams.eventType === 'string' ? searchParams.eventType : undefined,
    dateFrom: typeof searchParams.dateFrom === 'string' ? searchParams.dateFrom : undefined,
    dateTo: typeof searchParams.dateTo === 'string' ? searchParams.dateTo : undefined,
    severity: typeof searchParams.severity === 'string' ? searchParams.severity : undefined,
  }
}

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireAdmin()
  const params = await searchParams
  const tab = params.tab === 'events' ? 'events' : 'audit'
  const page = Math.max(1, Number(params.page ?? '1') || 1)
  const filters = parseLogFilters(params)

  const auditResult =
    tab === 'audit' ? await getAuditLogs(filters, page, PAGE_SIZE) : { logs: [], total: 0 }
  const eventsResult =
    tab === 'events'
      ? await getJobEventsForLogs(filters, page, PAGE_SIZE)
      : { events: [], total: 0 }

  return (
    <div className="space-y-4 animate-enter">
      <DeskPageHeader
        kicker="Ship's logbook"
        title="Logbook"
        description="Audit trail and job event history for the publishing voyage."
      />

      <Suspense fallback={<LoadingState label="Unrolling the log…" />}>
        <LogsTable
          tab={tab}
          auditLogs={auditResult.logs}
          jobEvents={eventsResult.events}
          total={tab === 'audit' ? auditResult.total : eventsResult.total}
          page={page}
          pageSize={PAGE_SIZE}
        />
      </Suspense>
    </div>
  )
}
