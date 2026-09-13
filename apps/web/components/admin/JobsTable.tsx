'use client'

// Ship's log. Icon buttons hit server actions. Demo login cannot write.

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { Ban, ExternalLink, Eye, Pause, Play, RotateCcw, Trash2, Zap } from 'lucide-react'
import { useRouter } from 'next/navigation'

import {
  cancelJob,
  deleteJobRecord,
  forceStartDespiteDailyLimit,
  pauseJob,
  retryJobUpload,
  unpauseJob,
} from '@/app/actions/adminActions'
import { useAdminCapabilities } from '@/components/admin/AdminCapabilities'
import { StatusBadge } from '@/components/app/StatusBadge'
import type { JobListRow } from '@/lib/data/adminQueries'
import { displayFailureReason, isActiveDailyUploadLimit } from '@/lib/jobs/dailyLimitDisplay'
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
  return <span className="soft-chip">{children}</span>
}

export function JobsTable({ jobs }: { jobs: JobListRow[] }) {
  const router = useRouter()
  const { canWrite } = useAdminCapabilities()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'delete' | 'cancel'>('delete')
  const [pendingJobId, setPendingJobId] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleRetry(jobId: string) {
    if (!canWrite) {
      setActionMessage('Demo account is read-only.')
      return
    }
    setBusy(true)
    try {
      const result = await retryJobUpload(jobId)
      setActionMessage(
        result.success
          ? (result.message ?? 'Retry queued. Runs when local worker/n8n is up.')
          : (result.error ?? 'Retry failed.'),
      )
      if (result.success) router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function handleForceStart(jobId: string) {
    if (!canWrite) {
      setActionMessage('Demo account is read-only.')
      return
    }
    setBusy(true)
    try {
      const result = await forceStartDespiteDailyLimit(jobId)
      setActionMessage(
        result.success
          ? (result.message ?? 'Force-start armed.')
          : (result.error ?? 'Force-start failed.'),
      )
      if (result.success) router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function handlePauseToggle(jobId: string, status: string) {
    if (!canWrite) {
      setActionMessage('Demo account is read-only.')
      return
    }
    setBusy(true)
    try {
      const result = status === 'paused' ? await unpauseJob(jobId) : await pauseJob(jobId)
      setActionMessage(
        result.success
          ? (result.message ?? (status === 'paused' ? 'Job unpaused.' : 'Job paused.'))
          : (result.error ?? 'Pause action failed.'),
      )
      if (result.success) router.refresh()
    } finally {
      setBusy(false)
    }
  }

  function openDeleteDialog(jobId: string) {
    setPendingJobId(jobId)
    setDialogMode('delete')
    setDialogOpen(true)
  }

  function openCancelDialog(jobId: string) {
    setPendingJobId(jobId)
    setDialogMode('cancel')
    setDialogOpen(true)
  }

  async function confirmDialog() {
    if (!pendingJobId) return
    setBusy(true)
    try {
      if (dialogMode === 'cancel') {
        const result = await cancelJob(pendingJobId)
        setActionMessage(
          result.success ? 'Job cancelled.' : (result.error ?? 'Cancel failed.'),
        )
        if (result.success) router.refresh()
      } else {
        const result = await deleteJobRecord(pendingJobId)
        setActionMessage(
          result.success
            ? (result.message ?? 'Job deleted.')
            : (result.error ?? 'Delete failed.'),
        )
        if (result.success) router.refresh()
      }
    } finally {
      setBusy(false)
      setDialogOpen(false)
      setPendingJobId(null)
    }
  }

  if (jobs.length === 0) {
    return (
      <div className="desk-panel rounded-md border border-dashed border-border/80 px-4 py-10 text-center text-sm text-muted-foreground">
        No jobs yet.
      </div>
    )
  }

  return (
    <>
      <AdminAutoRefresh paused={dialogOpen || busy} />
      {actionMessage ? (
        <p className="notice-warn mb-3 rounded-md border px-3 py-2 text-sm">{actionMessage}</p>
      ) : null}

      <div className="desk-panel overflow-hidden rounded-md border border-border/80">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="border-b border-border/70 bg-muted/35 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              <tr>
                <th className="px-2.5 py-2.5 font-medium">Queue</th>
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
                  className="bg-row-hover border-b border-border/60 last:border-b-0 transition-colors"
                >
                  <td className="px-2.5 py-2 font-mono text-xs text-muted-foreground">
                    {job.queue_position != null ? `#${job.queue_position}` : '—'}
                  </td>
                  <td className="px-2.5 py-2 font-mono text-xs text-foreground/90">
                    {shortId(job.id)}
                  </td>
                  <td className="px-2.5 py-2 text-xs text-muted-foreground">
                    {job.created_at_label}
                  </td>
                  <td className="px-2.5 py-2 text-xs capitalize">{job.source_platform}</td>
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
                  <td className="px-2.5 py-2 text-xs">
                    <div className="flex flex-wrap gap-2">
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
                  <td className="px-2.5 py-2 text-xs tabular-nums">
                    {isActiveDailyUploadLimit(job) && canWrite ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleForceStart(job.id)}
                        title="Force-start this job past the soft daily upload limit"
                        aria-label="Force start past daily limit"
                        className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-amber-900 transition-colors hover:bg-amber-500/20 disabled:opacity-50 dark:text-amber-300"
                      >
                        <Zap className="size-3" aria-hidden />
                        Force
                      </button>
                    ) : (
                      job.retry_count
                    )}
                  </td>
                  <td
                    className="max-w-[10rem] truncate px-2.5 py-2 text-xs text-muted-foreground"
                    title={displayFailureReason(job) ?? undefined}
                  >
                    {displayFailureReason(job) ? truncateText(displayFailureReason(job)!, 36) : '—'}
                  </td>
                  <td className="px-2.5 py-2">
                    <div className="flex items-center gap-0.5">
                      <ActionIcon label="View details" href={`/admin/jobs/${job.id}`}>
                        <Eye className="size-3.5" />
                      </ActionIcon>
                      <ActionIcon label="Open source URL" href={job.source_url} external>
                        <ExternalLink className="size-3.5" />
                      </ActionIcon>
                      {canWrite ? (
                        <>
                          {job.status === 'paused' ||
                          !['completed', 'cancelled', 'ignored'].includes(job.status) ? (
                            <ActionIcon
                              label={job.status === 'paused' ? 'Unpause job' : 'Pause job'}
                              onClick={() => void handlePauseToggle(job.id, job.status)}
                            >
                              {job.status === 'paused' ? (
                                <Play className="size-3.5" />
                              ) : (
                                <Pause className="size-3.5" />
                              )}
                            </ActionIcon>
                          ) : null}
                          <ActionIcon label="Retry upload" onClick={() => void handleRetry(job.id)}>
                            <RotateCcw className="size-3.5" />
                          </ActionIcon>
                          <ActionIcon
                            label="Cancel job"
                            tone="danger"
                            onClick={() => openCancelDialog(job.id)}
                          >
                            <Ban className="size-3.5" />
                          </ActionIcon>
                          <ActionIcon
                            label="Delete job"
                            tone="danger"
                            onClick={() => openDeleteDialog(job.id)}
                          >
                            <Trash2 className="size-3.5" />
                          </ActionIcon>
                        </>
                      ) : null}
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
        title={dialogMode === 'cancel' ? 'Cancel this job?' : 'Delete this job entry?'}
        description={
          dialogMode === 'cancel'
            ? 'This stops automatic processing and retries for the job. Existing platform posts are not deleted. Continue?'
            : 'This permanently removes the job record and its logs from Supabase. YouTube/Instagram posts are not deleted. Staged Drive files are not auto-deleted — remove those from Failed Review first if needed. Continue?'
        }
        confirmLabel={dialogMode === 'cancel' ? 'Cancel job' : 'Delete job'}
        onConfirm={() => void confirmDialog()}
        onCancel={() => {
          setDialogOpen(false)
          setPendingJobId(null)
        }}
      />
    </>
  )
}
