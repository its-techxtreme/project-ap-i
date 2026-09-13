'use client'

// Ship's log filters. Query string is the source of truth.

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Filter, X } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { emitTutorialAction } from '@/lib/demo/tutorial-bus'
import { cn } from '@/lib/utils'

type NicheOption = { id: string; name: string }

const STATUS_OPTIONS = [
  { value: 'queued', label: 'Queued' },
  { value: 'processing', label: 'Processing' },
  { value: 'uploading', label: 'Uploading' },
  { value: 'awaiting_verification', label: 'Verifying' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'needs_manual_review', label: 'Review' },
  { value: 'cancelled', label: 'Cancelled' },
] as const

const UPLOAD_STATUS_OPTIONS = [
  'pending',
  'uploading',
  'uploaded',
  'verified',
  'failed',
  'login_required',
  'retry_scheduled',
]

const fieldClass = cn(
  'h-8 w-full min-w-0 rounded-md border border-border/80 bg-background/80 px-2 text-xs text-foreground',
  'ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
)

function Field({
  id,
  label,
  children,
  className,
}: {
  id: string
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <label htmlFor={id} className={cn('flex min-w-[7.5rem] flex-1 flex-col gap-1', className)}>
      <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  )
}

export function JobFilters({ niches }: { niches: NicheOption[] }) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  const selectedStatuses = searchParams.get('status')?.split(',').filter(Boolean) ?? []
  const activeCount = [
    searchParams.get('nicheId'),
    searchParams.get('sourcePlatform'),
    searchParams.get('youtubeUploadStatus'),
    searchParams.get('instagramUploadStatus'),
    selectedStatuses.length ? 'status' : null,
  ].filter(Boolean).length

  function updateParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '') params.delete(key)
      else params.set(key, value)
    }
    // Old from/to query keys. Drop them so the URL stays clean.
    params.delete('dateFrom')
    params.delete('dateTo')
    params.delete('page')
    emitTutorialAction('filter-jobs')
    router.push(`${pathname}?${params.toString()}`)
  }

  function toggleStatus(status: string) {
    const next = selectedStatuses.includes(status)
      ? selectedStatuses.filter((s) => s !== status)
      : [...selectedStatuses, status]
    updateParams({ status: next.length ? next.join(',') : null })
  }

  return (
    <div
      className="panel-surface overflow-hidden rounded-xl border border-border"
      data-tutorial="job-filters"
    >
      <div className="flex flex-wrap items-end gap-x-2.5 gap-y-2 px-3 py-2.5">
        <div className="mb-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/50 text-primary">
          <Filter className="size-3.5" aria-hidden />
        </div>

        <Field id="nicheId" label="Niche" className="min-w-[8rem] max-w-[11rem]">
          <select
            id="nicheId"
            className={fieldClass}
            value={searchParams.get('nicheId') ?? ''}
            onChange={(e) => updateParams({ nicheId: e.target.value || null })}
          >
            <option value="">All niches</option>
            {niches.map((niche) => (
              <option key={niche.id} value={niche.id}>
                {niche.name}
              </option>
            ))}
          </select>
        </Field>

        <Field id="sourcePlatform" label="Source" className="min-w-[7.5rem] max-w-[9rem]">
          <select
            id="sourcePlatform"
            className={fieldClass}
            value={searchParams.get('sourcePlatform') ?? ''}
            onChange={(e) => updateParams({ sourcePlatform: e.target.value || null })}
          >
            <option value="">All platforms</option>
            <option value="youtube">YouTube</option>
            <option value="instagram">Instagram</option>
          </select>
        </Field>

        <Field id="youtubeUploadStatus" label="YouTube" className="min-w-[7.5rem] max-w-[9rem]">
          <select
            id="youtubeUploadStatus"
            className={fieldClass}
            value={searchParams.get('youtubeUploadStatus') ?? ''}
            onChange={(e) => updateParams({ youtubeUploadStatus: e.target.value || null })}
          >
            <option value="">Any</option>
            {UPLOAD_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </Field>

        <Field id="instagramUploadStatus" label="Instagram" className="min-w-[7.5rem] max-w-[9rem]">
          <select
            id="instagramUploadStatus"
            className={fieldClass}
            value={searchParams.get('instagramUploadStatus') ?? ''}
            onChange={(e) => updateParams({ instagramUploadStatus: e.target.value || null })}
          >
            <option value="">Any</option>
            {UPLOAD_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </Field>

        {activeCount > 0 ? (
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs" asChild>
            <Link href={pathname}>
              <X className="size-3.5" aria-hidden />
              Clear ({activeCount})
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 bg-background/30 px-3 py-2">
        <span className="mr-1 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Status
        </span>
        {STATUS_OPTIONS.map((status) => {
          const active = selectedStatuses.includes(status.value)
          return (
            <button
              key={status.value}
              type="button"
              onClick={() => toggleStatus(status.value)}
              aria-pressed={active}
              className={cn(
                'h-7 rounded-md border px-2 text-xs transition-colors',
                active
                  ? 'border-primary/45 bg-primary/15 text-primary'
                  : 'border-border/70 bg-transparent text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground',
              )}
            >
              {status.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
