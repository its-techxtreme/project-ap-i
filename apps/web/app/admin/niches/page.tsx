import { EmptyState } from '@/components/app/EmptyState'
import { DeskPageHeader } from '@/components/desk/DeskPageHeader'
import { SeaLanesGrid } from '@/components/desk/SeaLanesGrid'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getCollectorLaneCard, getNicheAccountMappings } from '@/lib/data/adminQueries'

export const revalidate = 3600

export default async function AdminNichesPage() {
  await requireAdmin()
  const [niches, collector] = await Promise.all([
    getNicheAccountMappings(),
    getCollectorLaneCard(),
  ])

  return (
    <div className="space-y-4 animate-enter">
      <DeskPageHeader
        kicker="Chart of lanes"
        title="Sea lanes"
        description="Niche to platform account mapping with live YouTube and Instagram profiles (refreshed hourly). Editing lands in a later voyage."
      />

      {niches.length === 0 && !collector ? (
        <EmptyState title="No sea lanes" description="No niches are configured yet." />
      ) : (
        <SeaLanesGrid niches={niches} collector={collector} />
      )}
    </div>
  )
}
