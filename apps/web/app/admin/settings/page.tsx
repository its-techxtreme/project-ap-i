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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Read-only system settings. Editing will be enabled in Phase 16.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-4 py-3 font-medium">Setting</th>
              <th className="px-4 py-3 font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {DISPLAY_KEYS.map((key) => (
              <tr key={key} className="border-b last:border-b-0">
                <td className="px-4 py-3 font-mono text-xs">{key}</td>
                <td className="px-4 py-3">
                  {formatSettingValue(settings[key])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
