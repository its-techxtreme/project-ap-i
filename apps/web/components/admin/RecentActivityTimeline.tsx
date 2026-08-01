import { ActivityFeed } from '@/components/desk/ActivityFeed'
import type { JobEventRow } from '@/lib/data/adminQueries'

/** @deprecated Prefer ActivityFeed — kept for existing tests/imports. */
export function RecentActivityTimeline({ events }: { events: JobEventRow[] }) {
  return <ActivityFeed events={events} />
}
