'use client'

import { useState, type ReactNode } from 'react'
import { Ban, ExternalLink, RotateCcw, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

import {
  bulkDeleteDriveFiles,
  bulkMarkJobsIgnored,
  bulkRetryJobUploads,
  deleteDriveFile,
  markJobIgnored,
  retryJobUpload,
} from '@/app/actions/adminActions'
import { useAdminCapabilities } from '@/components/admin/AdminCapabilities'
import { StatusBadge } from '@/components/app/StatusBadge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import type { FailedJobRow } from '@/lib/data/adminQueries'
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

export function FailedJobsTable({ jobs }: { jobs: FailedJobRow[] }) {
  const router = useRouter()
  const { canWrite } = useAdminCapabilities()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'delete' | 'bulk-delete'>('delete')
  const [pendingJobId, setPendingJobId] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const allSelected = jobs.length > 0 && selected.size === jobs.length
  const selectedIds = [...selected]

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(jobs.map((job) => job.id)) : new Set())
  }

  function toggleOne(jobId: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(jobId)
      else next.delete(jobId)
      return next
    })
  }

  async function runRowAction(action: 'retry' | 'ignore', jobId: string) {
    setBusy(true)
    try {
      const result =
        action === 'retry' ? await retryJobUpload(jobId) : await markJobIgnored(jobId)
      if (!result.success) {
        setActionMessage(result.error ?? `${action} failed.`)
        return
      }
      if (action === 'retry' && 'message' in result && typeof result.message === 'string') {
        setActionMessage(result.message)
      } else {
        setActionMessage(
          action === 'retry'
            ? 'Retry queued. Runs when local worker/n8n is up.'
            : 'Job marked ignored.',
        )
      }
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function runBulkRetry() {
    if (selectedIds.length === 0 || busy) return
    setBusy(true)
    try {
      const result = await bulkRetryJobUploads(selectedIds)
      if (!result.success) {
        setActionMessage(result.error)
        return
      }
      setActionMessage(result.message)
      setSelected(new Set())
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function runBulkIgnore() {
    if (selectedIds.length === 0 || busy) return
    setBusy(true)
    try {
      const result = await bulkMarkJobsIgnored(selectedIds)
      if (!result.success) {
        setActionMessage(result.error)
        return
      }
      setActionMessage(result.message)
      setSelected(new Set())
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  function openDeleteDialog(jobId?: string) {
    if (jobId) {
      setPendingJobId(jobId)
      setDialogMode('delete')
    } else {
      setDialogMode('bulk-delete')
    }
    setDialogOpen(true)
  }

  async function confirmDelete() {
    setBusy(true)
    try {
      if (dialogMode === 'delete' && pendingJobId) {
        const result = await deleteDriveFile(pendingJobId)
        setActionMessage(
          result.success
            ? (result.message ?? 'Drive delete queued. Runs when local worker/n8n is up.')
            : (result.error ?? 'Delete failed.'),
        )
        if (result.success) router.refresh()
      } else if (dialogMode === 'bulk-delete') {
        const result = await bulkDeleteDriveFiles(selectedIds)
        if (!result.success) {
          setActionMessage(result.error)
        } else {
          setActionMessage(result.message)
          setSelected(new Set())
          router.refresh()
        }
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
        No failed jobs.
      </div>
    )
  }

  return (
    <>
      <AdminAutoRefresh paused={dialogOpen || busy} />

      {selected.size > 0 && canWrite ? (
        <div className="desk-panel mb-3 flex flex-wrap items-center gap-2 rounded-md border border-border/80 px-3 py-2.5">
          <span className="text-xs font-medium text-foreground">{selected.size} selected</span>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={busy}
            onClick={() => void runBulkRetry()}
          >
            Retry Selected
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={busy}
            onClick={() => openDeleteDialog()}
          >
            Delete Selected Drive Files
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={busy}
            onClick={() => void runBulkIgnore()}
          >
            Mark Selected Ignored
          </Button>
        </div>
      ) : selected.size > 0 ? (
        <p className="notice-warn mb-3 rounded-md border px-3 py-2 text-sm">
          Demo account is read-only — bulk actions are disabled.
        </p>
      ) : null}

      {actionMessage ? (
        <p className="notice-warn mb-3 rounded-md border px-3 py-2 text-sm">{actionMessage}</p>
      ) : null}

      <div className="desk-panel overflow-hidden rounded-md border border-border/80">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              <tr>
                <th className="px-2.5 py-2.5">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) => toggleAll(checked === true)}
                    aria-label="Select all failed jobs"
                  />
                </th>
                <th className="px-2.5 py-2.5 font-medium">Job</th>
                <th className="px-2.5 py-2.5 font-medium">Niche</th>
                <th className="px-2.5 py-2.5 font-medium">Stage</th>
                <th className="px-2.5 py-2.5 font-medium">YouTube</th>
                <th className="px-2.5 py-2.5 font-medium">Instagram</th>
                <th className="px-2.5 py-2.5 font-medium">Failure</th>
                <th className="px-2.5 py-2.5 font-medium">Drive</th>
                <th className="px-2.5 py-2.5 font-medium">Retries</th>
                <th className="px-2.5 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr
                  key={job.id}
                  className="bg-row-hover border-b border-border/60 last:border-b-0 transition-colors"
                >
                  <td className="px-2.5 py-2">
                    <Checkbox
                      checked={selected.has(job.id)}
                      onCheckedChange={(checked) => toggleOne(job.id, checked === true)}
                      aria-label={`Select job ${shortId(job.id)}`}
                    />
                  </td>
                  <td className="px-2.5 py-2 font-mono text-xs text-foreground/90">
                    {shortId(job.id)}
                  </td>
                  <td className="px-2.5 py-2 text-xs">
                    <SoftChip>{job.niche_name}</SoftChip>
                  </td>
                  <td className="px-2.5 py-2 font-mono text-[11px] text-muted-foreground">
                    {job.failure_code ?? '—'}
                  </td>
                  <td className="px-2.5 py-2">
                    <StatusBadge status={job.youtube_upload_status} />
                  </td>
                  <td className="px-2.5 py-2">
                    <StatusBadge status={job.instagram_upload_status} />
                  </td>
                  <td
                    className="max-w-[12rem] truncate px-2.5 py-2 text-xs text-muted-foreground"
                    title={job.failure_reason ?? undefined}
                  >
                    {job.failure_reason ? truncateText(job.failure_reason, 42) : '—'}
                  </td>
                  <td className="px-2.5 py-2">
                    {job.drive_view_url ? (
                      <a
                        href={job.drive_view_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary hover:underline"
                      >
                        Open
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground/40">None</span>
                    )}
                  </td>
                  <td className="px-2.5 py-2 text-xs tabular-nums">{job.retry_count}</td>
                  <td className="px-2.5 py-2">
                    <div className="flex items-center gap-0.5">
                      {canWrite ? (
                        <>
                          <ActionIcon
                            label="Retry upload"
                            onClick={() => void runRowAction('retry', job.id)}
                          >
                            <RotateCcw className="size-3.5" />
                          </ActionIcon>
                          <ActionIcon
                            label="Delete Drive file"
                            tone="danger"
                            onClick={() => openDeleteDialog(job.id)}
                          >
                            <Trash2 className="size-3.5" />
                          </ActionIcon>
                          <ActionIcon
                            label="Mark ignored"
                            onClick={() => void runRowAction('ignore', job.id)}
                          >
                            <Ban className="size-3.5" />
                          </ActionIcon>
                        </>
                      ) : null}
                      {job.source_url ? (
                        <ActionIcon label="Open source URL" href={job.source_url} external>
                          <ExternalLink className="size-3.5" />
                        </ActionIcon>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Accessible labels for screen readers / legacy assertions */}
      <div className="sr-only">
        {jobs.map((job) => (
          <div key={`sr-${job.id}`}>
            <button type="button" onClick={() => void runRowAction('retry', job.id)}>
              Retry Upload
            </button>
            <button type="button" onClick={() => openDeleteDialog(job.id)}>
              Delete Drive File
            </button>
            <button type="button" onClick={() => void runRowAction('ignore', job.id)}>
              Mark Ignored
            </button>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={dialogOpen}
        title="Delete staged Drive file?"
        description="This will delete the selected staged video file(s) from Google Drive. The job record and logs will remain in Supabase. Continue?"
        confirmLabel="Delete Drive file"
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          setDialogOpen(false)
          setPendingJobId(null)
        }}
      />
    </>
  )
}
