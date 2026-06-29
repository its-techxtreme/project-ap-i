'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { StatusBadge } from '@/components/app/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { AuditLogRow, JobEventRow } from '@/lib/data/adminQueries'
import { shortId, truncateText } from '@/lib/format/relativeTime'
import { cn } from '@/lib/utils'

import { Pagination } from './Pagination'

type LogsTableProps = {
  tab: 'audit' | 'events'
  auditLogs: AuditLogRow[]
  jobEvents: JobEventRow[]
  total: number
  page: number
  pageSize: number
}

const selectClassName = cn(
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
)

export function LogsTable({
  tab,
  auditLogs,
  jobEvents,
  total,
  page,
  pageSize,
}: LogsTableProps) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  function setTab(nextTab: 'audit' | 'events') {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', nextTab)
    params.delete('page')
    router.push(`${pathname}?${params.toString()}`)
  }

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (!value) params.delete(key)
    else params.set(key, value)
    params.delete('page')
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button
          variant={tab === 'audit' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTab('audit')}
        >
          Audit Logs
        </Button>
        <Button
          variant={tab === 'events' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTab('events')}
        >
          Job Events
        </Button>
      </div>

      <div className="grid gap-4 rounded-lg border p-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="jobId">Job ID search</Label>
          <Input
            id="jobId"
            placeholder="Full or partial job UUID"
            defaultValue={searchParams.get('jobId') ?? ''}
            onBlur={(e) => updateParam('jobId', e.target.value.trim())}
          />
        </div>
        {tab === 'audit' ? (
          <div className="space-y-2">
            <Label htmlFor="action">Action</Label>
            <Input
              id="action"
              placeholder="e.g. job_created"
              defaultValue={searchParams.get('action') ?? ''}
              onBlur={(e) => updateParam('action', e.target.value.trim())}
            />
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="eventType">Event type</Label>
            <Input
              id="eventType"
              placeholder="e.g. download_started"
              defaultValue={searchParams.get('eventType') ?? ''}
              onBlur={(e) => updateParam('eventType', e.target.value.trim())}
            />
          </div>
        )}
        {tab === 'events' ? (
          <div className="space-y-2">
            <Label htmlFor="severity">Severity</Label>
            <select
              id="severity"
              className={selectClassName}
              value={searchParams.get('severity') ?? ''}
              onChange={(e) => updateParam('severity', e.target.value)}
            >
              <option value="">Any</option>
              <option value="debug">debug</option>
              <option value="info">info</option>
              <option value="warning">warning</option>
              <option value="error">error</option>
            </select>
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="dateFrom">Date from</Label>
          <Input
            id="dateFrom"
            type="date"
            defaultValue={searchParams.get('dateFrom') ?? ''}
            onChange={(e) => updateParam('dateFrom', e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dateTo">Date to</Label>
          <Input
            id="dateTo"
            type="date"
            defaultValue={searchParams.get('dateTo') ?? ''}
            onChange={(e) => updateParam('dateTo', e.target.value)}
          />
        </div>
      </div>

      {tab === 'audit' ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-3 py-2 font-medium">Timestamp</th>
                <th className="px-3 py-2 font-medium">Actor</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Target type</th>
                <th className="px-3 py-2 font-medium">Target ID</th>
                <th className="px-3 py-2 font-medium">IP address</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-muted-foreground">
                    No audit logs found.
                  </td>
                </tr>
              ) : (
                auditLogs.map((log) => (
                  <tr key={log.id} className="border-b last:border-b-0">
                    <td className="px-3 py-2">{log.created_at_label}</td>
                    <td className="px-3 py-2">{log.actor_email ?? log.actor_user_id ?? 'system'}</td>
                    <td className="px-3 py-2">{log.action}</td>
                    <td className="px-3 py-2">{log.target_type ?? '—'}</td>
                    <td className="px-3 py-2">
                      {log.target_type === 'job' && log.target_id ? (
                        <Link href={`/admin/jobs/${log.target_id}`} className="underline">
                          {shortId(log.target_id)}
                        </Link>
                      ) : (
                        (log.target_id ?? '—')
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {log.ip_address ? truncateText(log.ip_address, 16) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-3 py-2 font-medium">Timestamp</th>
                <th className="px-3 py-2 font-medium">Job ID</th>
                <th className="px-3 py-2 font-medium">Stage</th>
                <th className="px-3 py-2 font-medium">Severity</th>
                <th className="px-3 py-2 font-medium">Message</th>
              </tr>
            </thead>
            <tbody>
              {jobEvents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-muted-foreground">
                    No job events found.
                  </td>
                </tr>
              ) : (
                jobEvents.map((event) => (
                  <tr key={event.id} className="border-b last:border-b-0">
                    <td className="px-3 py-2">{event.created_at_label}</td>
                    <td className="px-3 py-2">
                      {event.job_id ? (
                        <Link href={`/admin/jobs/${event.job_id}`} className="underline">
                          {shortId(event.job_id)}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2">{event.stage ?? event.event_type}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={event.severity} />
                    </td>
                    <td className="px-3 py-2">{event.message ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} pageSize={pageSize} total={total} />
    </div>
  )
}
