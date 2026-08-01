import { MetricTileGrid } from '@/components/desk/MetricTileGrid'
import type { JobSummary } from '@/lib/data/adminQueries'

/** @deprecated Prefer MetricTileGrid — kept for existing tests/imports. */
export function OverviewCards({ summary }: { summary: JobSummary }) {
  return <MetricTileGrid summary={summary} />
}
