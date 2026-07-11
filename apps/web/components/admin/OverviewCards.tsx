import Link from 'next/link'

import type { JobSummary } from '@/lib/data/adminQueries'
import { cn } from '@/lib/utils'

const cards: {
  key: keyof JobSummary
  label: string
  href?: string
  valueClass: string
}[] = [
  { key: 'queued', label: 'Queued', href: '/admin/jobs?status=queued', valueClass: 'text-foreground' },
  {
    key: 'processing',
    label: 'Processing',
    href: '/admin/jobs?status=processing,uploading',
    valueClass: 'text-sky-400',
  },
  {
    key: 'completedToday',
    label: 'Completed today',
    href: '/admin/jobs?status=completed',
    valueClass: 'text-emerald-400',
  },
  {
    key: 'failedToday',
    label: 'Failed today',
    href: '/admin/jobs?status=failed',
    valueClass: 'text-red-400',
  },
  {
    key: 'needsManualReview',
    label: 'Needs review',
    href: '/admin/failed',
    valueClass: 'text-orange-300',
  },
  {
    key: 'loginRequiredAccounts',
    label: 'Login required',
    href: '/admin/accounts',
    valueClass: 'text-red-400',
  },
  {
    key: 'driveWaitingCleanup',
    label: 'Drive cleanup',
    href: '/admin/failed',
    valueClass: 'text-amber-300',
  },
]

export function OverviewCards({ summary }: { summary: JobSummary }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const content = (
          <>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {card.label}
            </p>
            <p className={cn('mt-1 text-2xl font-semibold tabular-nums', card.valueClass)}>
              {summary[card.key]}
            </p>
          </>
        )

        const className =
          'rounded-lg border border-border bg-card/40 px-3 py-2.5 transition-colors hover:bg-muted/30'

        if (card.href) {
          return (
            <Link key={card.key} href={card.href} className={className}>
              {content}
            </Link>
          )
        }

        return (
          <div key={card.key} className={className}>
            {content}
          </div>
        )
      })}
    </div>
  )
}
