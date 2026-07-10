'use client'

import Link from 'next/link'
import { useState } from 'react'

import { deleteDriveFile, retryJobUpload } from '@/app/actions/adminActions'
import { StatusBadge } from '@/components/app/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { JobListRow } from '@/lib/data/adminQueries'
import { shortId, truncateText } from '@/lib/format/relativeTime'

import { AdminAutoRefresh } from './AdminAutoRefresh'
import { ConfirmDialog } from './ConfirmDialog'

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
    return <p className="text-sm text-muted-foreground">No jobs yet.</p>
  }

  return (
    <>
      <AdminAutoRefresh paused={dialogOpen} />
      {actionMessage ? (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {actionMessage}
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-3 py-2 font-medium">Job ID</th>
              <th className="px-3 py-2 font-medium">Created</th>
              <th className="px-3 py-2 font-medium">Source Platform</th>
              <th className="px-3 py-2 font-medium">Niche</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">YouTube Status</th>
              <th className="px-3 py-2 font-medium">Instagram Status</th>
              <th className="px-3 py-2 font-medium">YouTube URL</th>
              <th className="px-3 py-2 font-medium">Instagram URL</th>
              <th className="px-3 py-2 font-medium">Drive File</th>
              <th className="px-3 py-2 font-medium">Retry Count</th>
              <th className="px-3 py-2 font-medium">Failure Reason</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className="border-b last:border-b-0">
                <td className="px-3 py-2 font-mono">{shortId(job.id)}</td>
                <td className="px-3 py-2">{job.created_at_label}</td>
                <td className="px-3 py-2">
                  <Badge variant="outline">
                    {job.source_platform === 'youtube' ? 'YouTube' : 'Instagram'}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  <Badge variant="secondary">{job.niche_name}</Badge>
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={job.status} />
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={job.youtube_upload_status} />
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={job.instagram_upload_status} />
                </td>
                <td className="px-3 py-2">
                  {job.youtube_url ? (
                    <a
                      href={job.youtube_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      Open
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-3 py-2">
                  {job.instagram_url ? (
                    <a
                      href={job.instagram_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      Open
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
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
                <td className="px-3 py-2" title={job.failure_reason ?? undefined}>
                  {job.failure_reason ? truncateText(job.failure_reason, 40) : '—'}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/admin/jobs/${job.id}`}>View Details</Link>
                    </Button>
                    <Button variant="ghost" size="sm" asChild>
                      <a href={job.source_url} target="_blank" rel="noreferrer">
                        Open Source URL
                      </a>
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleRetry(job.id)}>
                      Retry
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openDeleteDialog(job.id)}>
                      Delete Drive File
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
          setPendingDeleteId(null)
        }}
      />
    </>
  )
}
