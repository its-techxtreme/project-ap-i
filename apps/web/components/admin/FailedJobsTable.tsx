'use client'

import { useState } from 'react'

import { deleteDriveFile, markJobIgnored, retryJobUpload } from '@/app/actions/adminActions'
import { StatusBadge } from '@/components/app/StatusBadge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import type { FailedJobRow } from '@/lib/data/adminQueries'
import { shortId } from '@/lib/format/relativeTime'

import { AdminAutoRefresh } from './AdminAutoRefresh'
import { ConfirmDialog } from './ConfirmDialog'

export function FailedJobsTable({ jobs }: { jobs: FailedJobRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'delete' | 'bulk-delete'>('delete')
  const [pendingJobId, setPendingJobId] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  const allSelected = jobs.length > 0 && selected.size === jobs.length

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

  async function runStubAction(action: 'retry' | 'ignore', jobId: string) {
    const result =
      action === 'retry' ? await retryJobUpload(jobId) : await markJobIgnored(jobId)
    setActionMessage(result.error ?? `${action} requested.`)
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
    if (dialogMode === 'delete' && pendingJobId) {
      const result = await deleteDriveFile(pendingJobId)
      setActionMessage(result.error ?? 'Delete requested.')
    } else if (dialogMode === 'bulk-delete') {
      setActionMessage('Bulk delete not yet implemented. Coming in Phase 11.')
    }
    setDialogOpen(false)
    setPendingJobId(null)
  }

  if (jobs.length === 0) {
    return <p className="text-sm text-muted-foreground">No failed jobs.</p>
  }

  return (
    <>
      <AdminAutoRefresh paused={dialogOpen} />

      {selected.size > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setActionMessage('Bulk retry not yet implemented. Coming in Phase 11.')}
          >
            Retry Selected (stub)
          </Button>
          <Button size="sm" variant="outline" onClick={() => openDeleteDialog()}>
            Delete Selected Drive Files (stub)
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setActionMessage('Bulk ignore not yet implemented. Coming in Phase 11.')}
          >
            Mark Selected Ignored (stub)
          </Button>
        </div>
      ) : null}

      {actionMessage ? (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {actionMessage}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-3 py-2">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(checked) => toggleAll(checked === true)}
                  aria-label="Select all failed jobs"
                />
              </th>
              <th className="px-3 py-2 font-medium">Job ID</th>
              <th className="px-3 py-2 font-medium">Niche</th>
              <th className="px-3 py-2 font-medium">Failed stage</th>
              <th className="px-3 py-2 font-medium">YouTube status</th>
              <th className="px-3 py-2 font-medium">Instagram status</th>
              <th className="px-3 py-2 font-medium">Failure reason</th>
              <th className="px-3 py-2 font-medium">Drive file</th>
              <th className="px-3 py-2 font-medium">Retry count</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className="border-b last:border-b-0">
                <td className="px-3 py-2">
                  <Checkbox
                    checked={selected.has(job.id)}
                    onCheckedChange={(checked) => toggleOne(job.id, checked === true)}
                    aria-label={`Select job ${shortId(job.id)}`}
                  />
                </td>
                <td className="px-3 py-2 font-mono">{shortId(job.id)}</td>
                <td className="px-3 py-2">{job.niche_name}</td>
                <td className="px-3 py-2">{job.failure_code ?? '—'}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={job.youtube_upload_status} />
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={job.instagram_upload_status} />
                </td>
                <td className="px-3 py-2">{job.failure_reason ?? '—'}</td>
                <td className="px-3 py-2">
                  {job.drive_view_url ? (
                    <a
                      href={job.drive_view_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      Open
                    </a>
                  ) : (
                    'None'
                  )}
                </td>
                <td className="px-3 py-2">{job.retry_count}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    <Button variant="outline" size="sm" onClick={() => runStubAction('retry', job.id)}>
                      Retry Upload (stub)
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openDeleteDialog(job.id)}>
                      Delete Drive File (stub)
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => runStubAction('ignore', job.id)}>
                      Mark Ignored (stub)
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={dialogOpen}
        title="Delete staged Drive file?"
        description="This will delete the selected staged video file(s) from Google Drive. The job record and logs will remain in Supabase. Continue?"
        confirmLabel="Delete Drive file"
        onConfirm={confirmDelete}
        onCancel={() => {
          setDialogOpen(false)
          setPendingJobId(null)
        }}
      />
    </>
  )
}
