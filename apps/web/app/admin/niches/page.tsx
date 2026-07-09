import { StatusBadge } from '@/components/app/StatusBadge'
import { EmptyState } from '@/components/app/EmptyState'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getNicheAccountMappings } from '@/lib/data/adminQueries'

export default async function AdminNichesPage() {
  await requireAdmin()
  const niches = await getNicheAccountMappings()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Niches</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Niche to platform account mapping (read-only). Editing lands in a later phase.
        </p>
      </div>

      {niches.length === 0 ? (
        <EmptyState title="No niches" description="No niches are configured yet." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-muted-foreground">
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
                <tr key={niche.id} className="border-b border-border/70 last:border-0">
                  <td className="px-4 py-3 font-medium">{niche.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{niche.slug}</td>
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
