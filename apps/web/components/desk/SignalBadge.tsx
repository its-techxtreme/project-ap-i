import { cn } from '@/lib/utils'

/** Signal chip for Captain's Deck status. */
export function SignalBadge({
  status,
  className,
}: {
  status: string
  className?: string
}) {
  const tone = toneFor(status)
  const label = status.replace(/_/g, ' ')

  return (
    <span
      className={cn(
        'inline-flex max-w-[10rem] items-center gap-1.5 truncate rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.06em]',
        tone.wrap,
        className,
      )}
      aria-label={`Status: ${label}`}
      title={label}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', tone.dot)} aria-hidden />
      {label}
    </span>
  )
}

function toneFor(status: string): { wrap: string; dot: string } {
  const map: Record<string, { wrap: string; dot: string }> = {
    queued: { wrap: 'border-border/80 bg-muted/50 text-muted-foreground', dot: 'bg-muted-foreground' },
    paused: {
      wrap: 'border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-300',
      dot: 'bg-amber-500',
    },
    uploading: {
      wrap: 'border-primary/35 bg-primary/10 text-primary status-live',
      dot: 'bg-primary animate-pulse',
    },
    processing: {
      wrap: 'border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300',
      dot: 'bg-sky-500',
    },
    downloading: {
      wrap: 'border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300',
      dot: 'bg-sky-500',
    },
    completed: {
      wrap: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
      dot: 'bg-emerald-500',
    },
    verified: {
      wrap: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
      dot: 'bg-emerald-500',
    },
    uploaded: {
      wrap: 'border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300',
      dot: 'bg-sky-500',
    },
    failed: {
      wrap: 'border-destructive/40 bg-destructive/10 text-destructive',
      dot: 'bg-destructive',
    },
    needs_manual_review: {
      wrap: 'border-orange-500/35 bg-orange-500/10 text-orange-900 dark:text-orange-300',
      dot: 'bg-orange-500',
    },
    cancelled: { wrap: 'border-border/80 bg-muted/40 text-muted-foreground', dot: 'bg-muted-foreground' },
    ignored: { wrap: 'border-border/60 bg-muted/30 text-muted-foreground/80', dot: 'bg-muted-foreground/60' },
    login_required: {
      wrap: 'border-destructive/40 bg-destructive/10 text-destructive',
      dot: 'bg-destructive',
    },
  }
  return (
    map[status] ?? {
      wrap: 'border-border/80 bg-muted/40 text-muted-foreground',
      dot: 'bg-muted-foreground',
    }
  )
}
