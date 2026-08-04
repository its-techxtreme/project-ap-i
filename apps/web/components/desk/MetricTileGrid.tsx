'use client'

import Link from 'next/link'

import type { JobSummary } from '@/lib/data/adminQueries'
import { emitTutorialAction } from '@/lib/demo/tutorial-bus'
import { cn } from '@/lib/utils'

type Tile = {
  key: keyof JobSummary
  label: string
  href?: string
  accent: string
  alert?: boolean
}

const tiles: Tile[] = [
  { key: 'queued', label: 'At dock', href: '/admin/jobs?status=queued', accent: 'from-muted-foreground/80' },
  {
    key: 'processing',
    label: 'Under weigh',
    href: '/admin/jobs?status=processing,uploading',
    accent: 'from-sky-500',
  },
  {
    key: 'completedToday',
    label: 'Landed today',
    href: '/admin/jobs?status=completed',
    accent: 'from-emerald-500',
  },
  {
    key: 'failedToday',
    label: 'Lost today',
    href: '/admin/jobs?status=failed',
    accent: 'from-destructive',
    alert: true,
  },
  {
    key: 'needsManualReview',
    label: 'Needs boarding',
    href: '/admin/failed',
    accent: 'from-orange-500',
    alert: true,
  },
  {
    key: 'loginRequiredAccounts',
    label: 'Crew locked out',
    href: '/admin/accounts',
    accent: 'from-destructive',
    alert: true,
  },
  {
    key: 'driveWaitingCleanup',
    label: 'Hold cleanup',
    href: '/admin/failed',
    accent: 'from-amber-500',
    alert: true,
  },
]

export function MetricTileGrid({ summary }: { summary: JobSummary }) {
  const max = Math.max(1, ...tiles.map((t) => summary[t.key]))

  return (
    <div
      className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4"
      data-tutorial="metrics"
      onClick={() => emitTutorialAction('view-metrics')}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          emitTutorialAction('view-metrics')
        }
      }}
      role="group"
      aria-label="Voyage metrics"
    >
      {tiles.map((tile) => {
        const value = summary[tile.key]
        const hot = Boolean(tile.alert && value > 0)
        const fill = Math.max(8, Math.round((value / max) * 100))
        const inner = (
          <>
            <div className="flex items-start justify-between gap-2">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {tile.label}
              </p>
              {hot ? (
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-destructive">
                  alert
                </span>
              ) : null}
            </div>
            <p
              className={cn(
                'mt-1.5 font-metric text-4xl font-semibold tabular-nums leading-none tracking-normal',
                hot ? 'text-destructive' : 'text-foreground',
              )}
            >
              {value}
            </p>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted/70" aria-hidden>
              <div
                className={cn('h-full rounded-full bg-gradient-to-r to-transparent', tile.accent)}
                style={{ width: `${fill}%`, opacity: value === 0 ? 0.25 : 0.9 }}
              />
            </div>
          </>
        )

        const className = cn(
          'desk-tile relative overflow-hidden rounded-md border border-border/80 px-3.5 py-3 transition-colors',
          'hover:border-primary/40',
          hot && 'border-destructive/35 bg-destructive/[0.04]',
        )

        if (tile.href) {
          return (
            <Link key={tile.key} href={tile.href} className={className}>
              {inner}
            </Link>
          )
        }
        return (
          <div key={tile.key} className={className}>
            {inner}
          </div>
        )
      })}
    </div>
  )
}
