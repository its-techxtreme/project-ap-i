import type { JobEventRow } from '@/lib/data/adminQueries'

export function RecentActivityTimeline({ events }: { events: JobEventRow[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No recent activity yet.</p>
  }

  return (
    <ol className="space-y-3">
      {events.map((event) => (
        <li key={event.id} className="flex gap-3 text-sm">
          <span className="w-28 shrink-0 text-muted-foreground">{event.created_at_label}</span>
          <div>
            <p className="font-medium">{event.stage ?? event.event_type}</p>
            <p className="text-muted-foreground">{event.message ?? 'No message'}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}
