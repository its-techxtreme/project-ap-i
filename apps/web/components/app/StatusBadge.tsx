const statusColors: Record<string, string> = {
  queued: 'bg-muted text-muted-foreground',
  locked: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  processing: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  downloading: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  downloaded: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  staging_to_drive: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  ready_to_upload: 'bg-teal-500/15 text-teal-800 dark:bg-violet-500/15 dark:text-violet-300',
  uploading: 'bg-cyan-500/15 text-cyan-800 dark:bg-indigo-500/15 dark:text-indigo-300',
  awaiting_verification: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  completed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  failed: 'bg-red-500/15 text-red-700 dark:text-red-400',
  needs_manual_review: 'bg-orange-500/15 text-orange-800 dark:text-orange-300',
  login_required: 'bg-red-500/15 text-red-700 dark:text-red-400',
  ignored: 'bg-muted text-muted-foreground/70',
  pending: 'bg-muted text-muted-foreground',
  uploaded: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  verified: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  retry_scheduled: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  skipped: 'bg-muted text-muted-foreground',
  debug: 'bg-muted text-muted-foreground',
  info: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  warning: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  error: 'bg-red-500/15 text-red-700 dark:text-red-400',
  active: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  paused: 'bg-muted text-muted-foreground',
  failing: 'bg-orange-500/15 text-orange-800 dark:text-orange-300',
  disabled: 'bg-muted text-muted-foreground/70',
}

export function StatusBadge({ status }: { status: string }) {
  const colorClass = statusColors[status] ?? 'bg-muted text-muted-foreground'
  const label = status.replace(/_/g, ' ')

  return (
    <span
      className={`inline-flex max-w-[9.5rem] items-center truncate rounded border border-border/70 px-1.5 py-0.5 text-[11px] font-medium leading-tight ${colorClass}`}
      aria-label={`Status: ${label}`}
      title={label}
    >
      {label}
    </span>
  )
}
