import Link from 'next/link'

import type { JobEventRow } from '@/lib/data/adminQueries'
import { cn } from '@/lib/utils'

export function ActivityFeed({
  events,
  embedded = false,
}: {
  events: JobEventRow[]
  embedded?: boolean
}) {
  if (events.length === 0) {
    return (
      <div
        className={cn(
          'px-4 py-8 text-center text-sm text-muted-foreground',
          !embedded && 'pn border-dashed',
        )}
      >
        No recent pipeline events.
      </div>
    )
  }

  return (
    <ol
      className={cn(
        'divide-y divide-border/60 overflow-hidden',
        !embedded && 'pn',
      )}
    >
      {events.map((event, index) => {
        const isError =
          (event.message ?? '').toLowerCase().includes('fail') ||
          (event.severity ?? '') === 'error' ||
          (event.event_type ?? '').includes('fail')
        return (
          <li
            key={event.id}
            className={cn(
              'grid gap-2 px-3.5 py-3 sm:grid-cols-[7.5rem_6.5rem_1fr] sm:items-start',
              index === 0 && 'bg-primary/[0.03]',
            )}
          >
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {event.created_at_label}
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-primary/90">
              {event.stage ?? event.event_type}
            </span>
            <div className="min-w-0">
              <p
                className={cn(
                  'text-sm leading-snug',
                  isError ? 'text-destructive' : 'text-foreground/90',
                )}
              >
                {event.message ?? 'No message'}
              </p>
              {event.job_id ? (
                <Link
                  href={`/admin/jobs/${event.job_id}`}
                  className="mt-1 inline-block font-mono text-[11px] text-muted-foreground hover:text-primary"
                >
                  job {event.job_id.slice(0, 8)}
                </Link>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
