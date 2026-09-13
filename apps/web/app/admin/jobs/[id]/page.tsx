import Link from 'next/link'
import { notFound } from 'next/navigation'

import { StatusBadge } from '@/components/app/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getJobDetail } from '@/lib/data/adminQueries'
import { formatRelativeTime, shortId } from '@/lib/format/relativeTime'
import { pickLatestSuccessfulUpload, resolveUploadHref } from '@/lib/format/uploadRefs'

// One job in Cargo bay. Timeline, upload URLs, Drive id.

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm">{value}</dd>
    </div>
  )
}

function UploadReference({
  url,
  mediaId,
}: {
  url: string | null | undefined
  mediaId: string | null | undefined
}) {
  const href = resolveUploadHref({ platform_url: url, platform_media_id: mediaId })
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="break-all underline">
        {href}
      </a>
    )
  }
  if (mediaId) return mediaId
  return '—'
}

function EventMessage({ message }: { message: string | null }) {
  if (!message) return <p className="mt-1 text-muted-foreground">No message</p>

  // Timeline text can include http(s) URLs. Make those clickable.
  const parts = message.split(/(https?:\/\/[^\s|]+)/g)
  return (
    <p className="mt-1 break-words text-muted-foreground">
      {parts.map((part, index) =>
        /^https?:\/\//i.test(part) ? (
          <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer" className="underline">
            {part}
          </a>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
    </p>
  )
}

export default async function AdminJobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const { id } = await params
  const detail = await getJobDetail(id)

  if (!detail) notFound()

  const { job, jobEvents, uploadAttempts } = detail
  const niche = job.niches as { name: string; slug: string } | null
  const submitter = job.submitter as { email: string | null; full_name: string | null } | null
  const youtubeAccount = job.youtube_account as { account_label: string } | null
  const instagramAccount = job.instagram_account as { account_label: string } | null
  const latestYoutubeAttempt = pickLatestSuccessfulUpload(uploadAttempts, 'youtube')
  const latestInstagramAttempt = pickLatestSuccessfulUpload(uploadAttempts, 'instagram')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Job {shortId(job.id)}</h1>
          <p className="text-sm text-muted-foreground">Full job detail and event timeline.</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/jobs">Back to jobs</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Basic info</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="Job ID" value={job.id} />
          <Field
            label="Source URL"
            value={
              <a href={job.source_url} target="_blank" rel="noreferrer" className="underline">
                {job.source_url}
              </a>
            }
          />
          <Field label="Platform" value={<Badge variant="outline">{job.source_platform}</Badge>} />
          <Field label="Niche" value={niche?.name ?? 'Unknown'} />
          <Field label="Submitted by" value={submitter?.email ?? submitter?.full_name ?? '—'} />
          <Field label="Rights confirmed" value={job.rights_confirmed ? 'Yes' : 'No'} />
          <Field label="Created at" value={formatRelativeTime(job.created_at)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Processing</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="Download status" value={<StatusBadge status={job.download_status} />} />
          <Field label="Processing status" value={<StatusBadge status={job.processing_status} />} />
          <Field
            label="Drive file"
            value={
              job.drive_view_url ? (
                <a href={job.drive_view_url} target="_blank" rel="noreferrer" className="underline">
                  Open Drive file
                </a>
              ) : (
                'None'
              )
            }
          />
          <Field
            label="Temp cleanup status"
            value={job.drive_deleted_at ? `Deleted ${formatRelativeTime(job.drive_deleted_at)}` : 'Pending'}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Metadata</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field label="YouTube title" value={job.youtube_title ?? 'Not generated yet'} />
          <Field label="YouTube description" value={job.youtube_description ?? 'Not generated yet'} />
          <Field label="Instagram caption" value={job.instagram_caption ?? 'Not generated yet'} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Uploads</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="YouTube account" value={youtubeAccount?.account_label ?? 'Not assigned'} />
          <Field label="YouTube status" value={<StatusBadge status={job.youtube_upload_status} />} />
          <Field
            label="YouTube uploaded URL"
            value={
              <UploadReference
                url={latestYoutubeAttempt?.platform_url}
                mediaId={latestYoutubeAttempt?.platform_media_id}
              />
            }
          />
          <Field label="Instagram account" value={instagramAccount?.account_label ?? 'Not assigned'} />
          <Field
            label="Instagram status"
            value={<StatusBadge status={job.instagram_upload_status} />}
          />
          <Field
            label="Instagram uploaded URL"
            value={
              <UploadReference
                url={latestInstagramAttempt?.platform_url}
                mediaId={latestInstagramAttempt?.platform_media_id}
              />
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Failures</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="Last error code" value={job.failure_code ?? '—'} />
          <Field label="Failure reason" value={job.failure_reason ?? '—'} />
          <Field label="Retry count" value={job.retry_count} />
          <Field label="YouTube retry count" value={job.youtube_retry_count} />
          <Field label="Instagram retry count" value={job.instagram_retry_count} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {jobEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events recorded yet.</p>
          ) : (
            <ol className="space-y-3">
              {jobEvents.map((event) => (
                <li key={event.id} className="rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={event.severity} />
                    <span className="font-medium">{event.stage ?? event.event_type}</span>
                    <span className="text-muted-foreground">
                      {formatRelativeTime(event.created_at)}
                    </span>
                  </div>
                  <EventMessage message={event.message} />
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
