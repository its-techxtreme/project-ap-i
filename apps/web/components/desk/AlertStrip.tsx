import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'

import type { JobSummary } from '@/lib/data/adminQueries'

export function AlertStrip({ summary }: { summary: JobSummary }) {
  const items: { label: string; href: string; count: number }[] = []
  if (summary.failedToday > 0) {
    items.push({ label: 'failed today', href: '/admin/jobs?status=failed', count: summary.failedToday })
  }
  if (summary.needsManualReview > 0) {
    items.push({ label: 'needs review', href: '/admin/failed', count: summary.needsManualReview })
  }
  if (summary.loginRequiredAccounts > 0) {
    items.push({
      label: 'login required',
      href: '/admin/accounts',
      count: summary.loginRequiredAccounts,
    })
  }
  if (summary.driveWaitingCleanup > 0) {
    items.push({
      label: 'drive cleanup',
      href: '/admin/failed',
      count: summary.driveWaitingCleanup,
    })
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-primary/25 bg-primary/5 px-3 py-2 font-mono text-[11px] text-primary">
        <span className="size-1.5 rounded-full bg-primary status-live" aria-hidden />
        Seas calm — no open alerts
      </div>
    )
  }

  return (
    <div className="notice-warn flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border px-3 py-2 text-sm">
      <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em]">
        <AlertTriangle className="size-3.5" aria-hidden />
        Alerts
      </span>
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className="font-mono text-[11px] underline-offset-2 hover:underline"
        >
          {item.count} {item.label}
        </Link>
      ))}
    </div>
  )
}
