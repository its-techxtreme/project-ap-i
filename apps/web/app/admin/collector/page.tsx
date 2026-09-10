import { CollectorArmedToggle } from '@/components/admin/CollectorArmedToggle'
import { CollectorInboxTable } from '@/components/admin/CollectorInboxTable'
import { DeskPageHeader } from '@/components/desk/DeskPageHeader'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getActiveNiches, getPendingCollectorInbox, getSystemSettings } from '@/lib/data/adminQueries'

function parseSettingFlag(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  if (value === 'true' || value === 1 || value === '1') return true
  if (value === 'false' || value === 0 || value === '0') return false
  return fallback
}

function runsFromSettings(value: unknown): { count: number; day: string | null } {
  if (!value || typeof value !== 'object') return { count: 0, day: null }
  const rec = value as { day?: unknown; runs?: unknown }
  const day = typeof rec.day === 'string' ? rec.day : null
  const count = Array.isArray(rec.runs) ? rec.runs.length : 0
  return { count, day }
}

export default async function AdminCollectorPage() {
  await requireAdmin()
  const [items, niches, settings] = await Promise.all([
    getPendingCollectorInbox(),
    getActiveNiches(),
    getSystemSettings(),
  ])
  const laptopEnabled = parseSettingFlag(settings.collector_enabled, false)
  const armed = parseSettingFlag(settings.collector_armed, true)
  const daily = runsFromSettings(settings.collector_daily_runs)

  return (
    <div className="space-y-4 animate-enter">
      <DeskPageHeader
        kicker="Boarding party"
        title="Unsorted cargo"
        description="Crew DMs that arrived without a niche. Open the link on Instagram, pick Memes / Anime / Sports, then confirm to queue the job. Reject drops junk so it stays off this list. Rights are assumed for collector DMs."
        meta={
          <span className="rounded-md border border-border/70 bg-card/50 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">
            {items.length} waiting
          </span>
        }
      />
      <CollectorArmedToggle
        armed={armed}
        laptopEnabled={laptopEnabled}
        runsToday={daily.count}
        maxRuns={2}
        workerDay={daily.day}
      />
      <CollectorInboxTable items={items} niches={niches} />
    </div>
  )
}
