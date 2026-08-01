import { StatusBadge } from '@/components/app/StatusBadge'
import { EmptyState } from '@/components/app/EmptyState'
import { DeskPageHeader } from '@/components/desk/DeskPageHeader'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getNicheAccountMappings } from '@/lib/data/adminQueries'

export default async function AdminNichesPage() {
  await requireAdmin()
  const niches = await getNicheAccountMappings()

  return (
    <div className="space-y-4 animate-enter">
      <DeskPageHeader
        kicker="Chart of lanes"
        title="Sea lanes"
        description="Niche to platform account mapping (read-only). Editing lands in a later voyage."
      />

      {niches.length === 0 ? (
        <EmptyState title="No sea lanes" description="No niches are configured yet." />
      ) : (
        <div className="desk-panel overflow-x-auto rounded-md border border-border/80">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border/70 bg-muted/35 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Niche</th>
                <th className="px-4 py-3 font-medium">Slug</th>
                <th className="px-4 py-3 font-medium">Active</th>
                <th className="px-4 py-3 font-medium">YouTube</th>
                <th className="px-4 py-3 font-medium">Instagram</th>
              </tr>
            </thead>
            <tbody>
              {niches.map((niche) => (
                <tr key={niche.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 font-medium">{niche.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{niche.slug}</td>
                  <td className="px-4 py-3">{niche.is_active ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-3">
                    {niche.youtube_label ? (
                      <div className="flex flex-col gap-1">
                        <span>{niche.youtube_label}</span>
                        {niche.youtube_status ? (
                          <StatusBadge status={niche.youtube_status} />
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Not mapped</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {niche.instagram_label ? (
                      <div className="flex flex-col gap-1">
                        <span>{niche.instagram_label}</span>
                        {niche.instagram_status ? (
                          <StatusBadge status={niche.instagram_status} />
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Not mapped</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
