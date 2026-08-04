'use client'

import { useEffect, useState } from 'react'
import { Laptop } from 'lucide-react'

import { getRemoteLaptopStatus } from '@/app/actions/remoteLaptopStatus'
import type { RemoteLaptopStatus } from '@/lib/admin/remoteLaptopStatus'
import { cn } from '@/lib/utils'

const POLL_MS = 15_000

const INITIAL: RemoteLaptopStatus = {
  state: 'offline',
  label: 'Remote laptop offline',
  shortLabel: 'Laptop offline',
  detail: 'Checking…',
  lastSeenAt: null,
  ok: null,
}

export function RemoteLaptopSignal({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<RemoteLaptopStatus>(INITIAL)

  useEffect(() => {
    let cancelled = false

    async function refresh() {
      try {
        const next = await getRemoteLaptopStatus()
        if (!cancelled) setStatus(next)
      } catch {
        if (!cancelled) {
          setStatus({
            state: 'offline',
            label: 'Remote laptop offline',
            shortLabel: 'Laptop offline',
            detail: 'Status check failed',
            lastSeenAt: null,
            ok: null,
          })
        }
      }
    }

    void refresh()
    const timer = window.setInterval(() => {
      void refresh()
    }, POLL_MS)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  const tone =
    status.state === 'ready'
      ? {
          wrap: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-300',
          dot: 'bg-emerald-500',
        }
      : status.state === 'degraded'
        ? {
            wrap: 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-300',
            dot: 'bg-amber-500',
          }
        : {
            wrap: 'border-border/70 bg-muted/40 text-muted-foreground',
            dot: 'bg-muted-foreground',
          }

  return (
    <div
      role="status"
      aria-live="polite"
      title={status.detail}
      data-tutorial="remote-laptop"
      className={cn(
        'inline-flex w-full max-w-full items-center gap-2 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] sm:px-3',
        !compact && 'lg:w-auto lg:max-w-[min(100%,22rem)]',
        tone.wrap,
      )}
    >
      <span className="relative flex size-2 shrink-0" aria-hidden>
        <span
          className={cn(
            'absolute inline-flex size-full rounded-full opacity-60',
            status.state === 'ready' && 'animate-ping bg-emerald-400',
            status.state === 'degraded' && 'animate-pulse bg-amber-400',
          )}
        />
        <span className={cn('relative inline-flex size-2 rounded-full', tone.dot)} />
      </span>
      <Laptop className="size-3.5 shrink-0 opacity-80" aria-hidden />
      <span className="min-w-0 truncate">{compact ? status.shortLabel : status.label}</span>
    </div>
  )
}
