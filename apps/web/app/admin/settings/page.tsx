import { DeskPageHeader } from '@/components/desk/DeskPageHeader'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getSystemSettings } from '@/lib/data/adminQueries'
import { formatSettingValue } from '@/lib/format/dateFilters'

/** Ops keys Chart room shows (excludes worker_heartbeat blob). */
const DISPLAY_KEYS = [
  'max_ffmpeg_concurrency',
  'max_download_concurrency',
  'max_source_duration_seconds',
  'max_source_file_size_mb',
  'verify_delay_minutes',
  'job_lock_minutes',
  'daily_upload_limit_per_account',
  'upload_stale_threshold_ms',
  'pipeline_stale_threshold_ms',
  'upload_platform_timeout_ms',
  'background_music_volume',
  'real_uploads_enabled',
  'youtube_uploads_enabled',
  'instagram_uploads_enabled',
] as const

export default async function AdminSettingsPage() {
  await requireAdmin()
  const settings = await getSystemSettings()
  const heartbeat = settings.worker_heartbeat as { at?: string } | undefined
  const syncedAt = heartbeat?.at ? new Date(heartbeat.at) : null
  const syncedLabel =
    syncedAt && !Number.isNaN(syncedAt.getTime()) ? syncedAt.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC') : null

  return (
    <div className="space-y-4 animate-enter">
      <DeskPageHeader
        kicker="Chart room"
        title="Chart room"
        description="Read-only effective voyage settings. Values sync from the remote laptop worker when it is online. Editing lands in a later voyage."
        meta={
          syncedLabel ? (
            <span className="rounded-md border border-border/70 bg-card/50 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">
              Last sync · {syncedLabel}
            </span>
          ) : null
        }
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
                <td className="px-4 py-3 font-mono text-xs tabular-nums">
                  {formatSettingValue(settings[key], key)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
