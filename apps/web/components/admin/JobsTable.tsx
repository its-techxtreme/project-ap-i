'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { ExternalLink, Eye, RotateCcw, Trash2 } from 'lucide-react'

import { deleteDriveFile, retryJobUpload } from '@/app/actions/adminActions'
import { StatusBadge } from '@/components/app/StatusBadge'
import type { JobListRow } from '@/lib/data/adminQueries'
import { shortId, truncateText } from '@/lib/format/relativeTime'
import { cn } from '@/lib/utils'

import { AdminAutoRefresh } from './AdminAutoRefresh'
import { ConfirmDialog } from './ConfirmDialog'

function ActionIcon({
  label,
  onClick,
  href,
  external,
  tone = 'default',
  children,
}: {
  label: string
  onClick?: () => void
  href?: string
  external?: boolean
  tone?: 'default' | 'danger'
  children: ReactNode
}) {
  const className = cn(
    'inline-flex size-7 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors',
    'hover:border-border hover:bg-muted hover:text-foreground',
    tone === 'danger' && 'hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400',
  )

  if (href) {
    if (external) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className={className}
          title={label}
          aria-label={label}
        >
          {children}
        </a>
      )
    }
    return (
      <Link href={href} className={className} title={label} aria-label={label}>
        {children}
      </Link>
    )
  }

  return (
    <button type="button" className={className} title={label} aria-label={label} onClick={onClick}>
      {children}
    </button>
  )
}

function SoftChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded border border-border/70 bg-background/60 px-1.5 py-0.5 text-[11px] text-foreground/90">
      {children}
    </span>
  )
}

export function JobsTable({ jobs }: { jobs: JobListRow[] }) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  async function handleRetry(jobId: string) {
    const result = await retryJobUpload(jobId)
    setActionMessage(result.error ?? 'Retry requested.')
  }

  function openDeleteDialog(jobId: string) {
    setPendingDeleteId(jobId)
    setDialogOpen(true)
  }

  async function confirmDelete() {
    if (!pendingDeleteId) return
    const result = await deleteDriveFile(pendingDeleteId)
    setActionMessage(result.error ?? 'Delete requested.')
    setDialogOpen(false)
    setPendingDeleteId(null)
  }

  if (jobs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/80 bg-card/30 px-4 py-10 text-center text-sm text-muted-foreground">
        No jobs yet.
      </div>
    )
  }

  return (
    <>
      <AdminAutoRefresh paused={dialogOpen} />
      {actionMessage ? (
        <p className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          {actionMessage}
        </p>
      ) : null}
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card/50 shadow-[inset_0_1px_0_0_hsl(var(--primary)/0.1)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="border-b border-border/80 bg-background/50 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              <tr>
                <th className="px-2.5 py-2.5 font-medium">Job</th>
                <th className="px-2.5 py-2.5 font-medium">Created</th>
                <th className="px-2.5 py-2.5 font-medium">Source</th>
                <th className="px-2.5 py-2.5 font-medium">Niche</th>
                <th className="px-2.5 py-2.5 font-medium">Status</th>
                <th className="px-2.5 py-2.5 font-medium">YouTube</th>
                <th className="px-2.5 py-2.5 font-medium">Instagram</th>
                <th className="px-2.5 py-2.5 font-medium">Links</th>
                <th className="px-2.5 py-2.5 font-medium">Retries</th>
                <th className="px-2.5 py-2.5 font-medium">Failure</th>
                <th className="px-2.5 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr
                  key={job.id}
                  className="border-b border-border/50 last:border-b-0 transition-colors hover:bg-[#121820]/80"
                >
                  <td className="px-2.5 py-2 font-mono text-xs text-foreground/90">
                    {shortId(job.id)}
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-2 text-xs text-muted-foreground">
                    {job.created_at_label}
                  </td>
                  <td className="px-2.5 py-2 text-xs">
                    <SoftChip>
                      {job.source_platform === 'youtube' ? 'YouTube' : 'Instagram'}
                    </SoftChip>
                  </td>
                  <td className="px-2.5 py-2 text-xs">
                    <SoftChip>{job.niche_name}</SoftChip>
                  </td>
                  <td className="px-2.5 py-2">
                    <StatusBadge status={job.status} />
                  </td>
                  <td className="px-2.5 py-2">
                    <StatusBadge status={job.youtube_upload_status} />
                  </td>
                  <td className="px-2.5 py-2">
                    <StatusBadge status={job.instagram_upload_status} />
                  </td>
                  <td className="px-2.5 py-2">
                    <div className="flex items-center gap-2 text-xs">
                      {job.youtube_url ? (
                        <a
                          href={job.youtube_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                        >
                          YT
                        </a>
                      ) : (
                        <span className="text-muted-foreground/40">YT</span>
                      )}
                      {job.instagram_url ? (
                        <a
                          href={job.instagram_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                        >
                          IG
                        </a>
                      ) : (
                        <span className="text-muted-foreground/40">IG</span>
                      )}
                      {job.drive_view_url ? (
                        <a
                          href={job.drive_view_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                        >
                          Drive
                        </a>
                      ) : (
                        <span className="text-muted-foreground/40">Drive</span>
                      )}
                    </div>
                  </td>
                  <td className="px-2.5 py-2 text-xs tabular-nums">{job.retry_count}</td>
                  <td
                    className="max-w-[10rem] truncate px-2.5 py-2 text-xs text-muted-foreground"
                    title={job.failure_reason ?? undefined}
                  >
                    {job.failure_reason ? truncateText(job.failure_reason, 36) : '—'}
                  </td>
                  <td className="px-2.5 py-2">
                    <div className="flex items-center gap-0.5">
                      <ActionIcon label="View details" href={`/admin/jobs/${job.id}`}>
                        <Eye className="size-3.5" />
                      </ActionIcon>
                      <ActionIcon label="Open source URL" href={job.source_url} external>
                        <ExternalLink className="size-3.5" />
                      </ActionIcon>
                      <ActionIcon label="Retry upload" onClick={() => handleRetry(job.id)}>
                        <RotateCcw className="size-3.5" />
                      </ActionIcon>
                      <ActionIcon
                        label="Delete Drive file"
                        tone="danger"
                        onClick={() => openDeleteDialog(job.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </ActionIcon>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="sr-only">
        {jobs.map((job) => (
          <Link key={`sr-${job.id}`} href={`/admin/jobs/${job.id}`}>
            View Details
          </Link>
        ))}
      </div>

      <ConfirmDialog
        open={dialogOpen}
        title="Delete staged Drive file?"
        description="This will delete the selected staged video file(s) from Google Drive. The job record and logs will remain in Supabase. Continue?"
        confirmLabel="Delete Drive file"
        onConfirm={confirmDelete}
        onCancel={() => {
          setDialogOpen(false)
          setPendingDeleteId(null)
        }}
      />
    </>
  )
}
