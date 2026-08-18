'use client'

import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { confirmCollectorInboxItem } from '@/app/actions/confirmCollectorInbox'
import { useAdminCapabilities } from '@/components/admin/AdminCapabilities'
import { Button } from '@/components/ui/button'
import type { CollectorInboxRow } from '@/lib/data/adminQueries'
import { truncateText } from '@/lib/format/relativeTime'

import { AdminAutoRefresh } from './AdminAutoRefresh'

export function CollectorInboxTable({
  items,
  niches,
}: {
  items: CollectorInboxRow[]
  niches: { id: string; name: string; slug: string }[]
}) {
  const router = useRouter()
  const { canWrite } = useAdminCapabilities()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nicheById, setNicheById] = useState<Record<string, string>>({})

  async function confirm(id: string) {
    const slug = nicheById[id]
    if (!slug) {
      setError('Pick a niche first.')
      return
    }
    setBusyId(id)
    setError(null)
    const result = await confirmCollectorInboxItem(id, slug)
    setBusyId(null)
    if (!result.success) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  if (items.length === 0) {
    return (
      <div className="desk-panel rounded-md border border-border/80 px-4 py-8 text-sm text-muted-foreground">
        No unsorted reels. Collector DMs with a niche word queue on their own.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <AdminAutoRefresh />
      {error ? (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      ) : null}
      <div className="space-y-4">
        {items.map((item) => (
            <article
              key={item.id}
              className="desk-panel space-y-3 rounded-md border border-border/80 p-4"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono">@{item.sender_username ?? 'unknown'}</span>
                <span>{item.created_at_label}</span>
              </div>
              <p className="break-all font-mono text-xs">{truncateText(item.source_url, 96)}</p>
              <a
                href={item.source_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                Open on Instagram
                <ExternalLink className="size-3.5" />
              </a>
              <div className="flex flex-wrap items-end gap-2">
                <label className="space-y-1 text-xs">
                  <span className="block font-mono uppercase tracking-wider text-muted-foreground">
                    Niche
                  </span>
                  <select
                    className="h-10 min-w-[160px] rounded-md border border-input bg-background px-3 text-sm"
                    value={nicheById[item.id] ?? ''}
                    disabled={!canWrite || busyId === item.id}
                    onChange={(event) =>
                      setNicheById((prev) => ({ ...prev, [item.id]: event.target.value }))
                    }
                  >
                    <option value="">Select…</option>
                    {niches.map((niche) => (
                      <option key={niche.id} value={niche.slug}>
                        {niche.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  type="button"
                  size="sm"
                  disabled={!canWrite || busyId === item.id}
                  onClick={() => void confirm(item.id)}
                >
                  {busyId === item.id ? 'Queuing…' : 'Confirm'}
                </Button>
              </div>
              {!canWrite ? (
                <p className="text-xs text-muted-foreground">Demo watch only — sign in as admin to confirm.</p>
              ) : null}
            </article>
        ))}
      </div>
    </div>
  )
}
