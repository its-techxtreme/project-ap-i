import { DeskPageHeader } from '@/components/desk/DeskPageHeader'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getSystemSettings } from '@/lib/data/adminQueries'
import { formatSettingValue } from '@/lib/format/dateFilters'

const DISPLAY_KEYS = [
  'max_ffmpeg_concurrency',
  'max_source_duration_seconds',
  'max_source_file_size_mb',
  'verify_delay_minutes',
  'job_lock_minutes',
] as const

export default async function AdminSettingsPage() {
  await requireAdmin()
  const settings = await getSystemSettings()

  return (
    <div className="space-y-4 animate-enter">
      <DeskPageHeader
        kicker="Chart room"
        title="Chart room"
        description="Read-only system settings. Editing will be enabled in a later voyage."
      />

      <div className="desk-panel overflow-hidden rounded-md border border-border/80">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border/70 bg-muted/35 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Setting</th>
              <th className="px-4 py-3 font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {DISPLAY_KEYS.map((key) => (
              <tr key={key} className="border-b border-border/60 last:border-b-0">
                <td className="px-4 py-3 font-mono text-xs">{key}</td>
                <td className="px-4 py-3">{formatSettingValue(settings[key])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
