import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { JobSummary } from '@/lib/data/adminQueries'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/admin/jobs',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/components/admin/AdminAutoRefresh', () => ({
  AdminAutoRefresh: () => null,
}))

vi.mock('@/app/actions/adminActions', () => ({
  retryJobUpload: vi.fn().mockResolvedValue({ success: false, error: 'stub' }),
  deleteDriveFile: vi.fn().mockResolvedValue({ success: false, error: 'stub' }),
  markJobIgnored: vi.fn().mockResolvedValue({ success: false, error: 'stub' }),
}))

const summary: JobSummary = {
  queued: 1,
  processing: 2,
  completedToday: 3,
  failedToday: 4,
  needsManualReview: 5,
  loginRequiredAccounts: 6,
  driveWaitingCleanup: 7,
}

describe('OverviewCards', () => {
  afterEach(() => cleanup())

  it('renders all 7 metric cards', async () => {
    const { OverviewCards } = await import('@/components/admin/OverviewCards')
    render(<OverviewCards summary={summary} />)

    expect(screen.getByText('Queued jobs')).toBeInTheDocument()
    expect(screen.getByText('Processing now')).toBeInTheDocument()
    expect(screen.getByText('Completed today')).toBeInTheDocument()
    expect(screen.getByText('Failed today')).toBeInTheDocument()
    expect(screen.getByText('Needs manual review')).toBeInTheDocument()
    expect(screen.getByText('Login required accounts')).toBeInTheDocument()
    expect(screen.getByText('Drive files waiting cleanup')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
  })
})

describe('JobsTable', () => {
  afterEach(() => cleanup())

  it('renders correct columns', async () => {
    const { JobsTable } = await import('@/components/admin/JobsTable')
    render(
      <JobsTable
        jobs={[
          {
            id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            created_at: new Date().toISOString(),
            created_at_label: 'just now',
            source_platform: 'youtube',
            niche_id: '11111111-1111-4111-8111-111111111111',
            niche_name: 'Memes',
            status: 'queued',
            youtube_upload_status: 'pending',
            instagram_upload_status: 'pending',
            drive_view_url: null,
            retry_count: 0,
            failure_reason: null,
            source_url: 'https://www.youtube.com/shorts/abc',
          },
        ]}
      />,
    )

    expect(screen.getByText('Job ID')).toBeInTheDocument()
    expect(screen.getByText('Created')).toBeInTheDocument()
    expect(screen.getByText('Source Platform')).toBeInTheDocument()
    expect(screen.getByText('Niche')).toBeInTheDocument()
    expect(screen.getByText('YouTube Status')).toBeInTheDocument()
    expect(screen.getByText('Instagram Status')).toBeInTheDocument()
    expect(screen.getByText('Drive File')).toBeInTheDocument()
    expect(screen.getByText('Retry Count')).toBeInTheDocument()
    expect(screen.getByText('Failure Reason')).toBeInTheDocument()
    expect(screen.getByText('Actions')).toBeInTheDocument()
  })

  it('shows "No jobs yet." when empty', async () => {
    const { JobsTable } = await import('@/components/admin/JobsTable')
    render(<JobsTable jobs={[]} />)
    expect(screen.getByText('No jobs yet.')).toBeInTheDocument()
  })
})

describe('StatusBadge', () => {
  afterEach(() => cleanup())

  it("renders 'completed' as green", async () => {
    const { StatusBadge } = await import('@/components/app/StatusBadge')
    render(<StatusBadge status="completed" />)
    const badge = screen.getByLabelText('Status: completed')
    expect(badge.className).toContain('bg-green-100')
  })

  it("renders 'needs_manual_review' as orange", async () => {
    const { StatusBadge } = await import('@/components/app/StatusBadge')
    render(<StatusBadge status="needs_manual_review" />)
    const badge = screen.getByLabelText('Status: needs manual review')
    expect(badge.className).toContain('bg-orange-100')
  })
})

describe('ConfirmDialog', () => {
  afterEach(() => cleanup())

  it('shows warning text before delete action', async () => {
    const { ConfirmDialog } = await import('@/components/admin/ConfirmDialog')
    render(
      <ConfirmDialog
        open
        title="Delete staged Drive file?"
        description="This will delete the selected staged video file(s) from Google Drive. The job record and logs will remain in Supabase. Continue?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(
      screen.getByText(
        'This will delete the selected staged video file(s) from Google Drive. The job record and logs will remain in Supabase. Continue?',
      ),
    ).toBeInTheDocument()
  })

  it('can be dismissed with Escape key', async () => {
    const onCancel = vi.fn()
    const { ConfirmDialog } = await import('@/components/admin/ConfirmDialog')
    render(
      <ConfirmDialog
        open
        title="Delete staged Drive file?"
        description="Continue?"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalled()
  })
})

describe('FailedJobsTable', () => {
  afterEach(() => cleanup())

  it('shows "No failed jobs." when empty', async () => {
    const { FailedJobsTable } = await import('@/components/admin/FailedJobsTable')
    render(<FailedJobsTable jobs={[]} />)
    expect(screen.getByText('No failed jobs.')).toBeInTheDocument()
  })

  it('bulk selection enables bulk action toolbar', async () => {
    const { FailedJobsTable } = await import('@/components/admin/FailedJobsTable')
    render(
      <FailedJobsTable
        jobs={[
          {
            id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            created_at: new Date().toISOString(),
            created_at_label: 'just now',
            source_platform: 'youtube',
            niche_id: '11111111-1111-4111-8111-111111111111',
            niche_name: 'Memes',
            status: 'failed',
            youtube_upload_status: 'failed',
            instagram_upload_status: 'pending',
            drive_view_url: null,
            retry_count: 1,
            failure_reason: 'Upload failed',
            failure_code: 'YOUTUBE_UPLOAD_FAILED',
            source_url: 'https://www.youtube.com/shorts/abc',
          },
        ]}
      />,
    )

    expect(screen.queryByText('Retry Selected (stub)')).not.toBeInTheDocument()
    await screen.findByRole('checkbox', { name: /Select job aaaaaaaa/i }).then((checkbox) => {
      fireEvent.click(checkbox)
    })
    expect(screen.getByText('Retry Selected (stub)')).toBeInTheDocument()
  })
})

describe('AccountsTable', () => {
  afterEach(() => cleanup())

  it('shows login-required warning banner', async () => {
    const { AccountsTable } = await import('@/components/admin/AccountsTable')
    render(
      <AccountsTable
        accounts={[
          {
            id: 'acc-1',
            niche_id: '11111111-1111-4111-8111-111111111111',
            niche_name: 'Memes',
            platform: 'youtube',
            account_label: 'Memes YT',
            status: 'login_required',
            login_required: true,
            last_successful_upload_at: null,
            last_successful_upload_label: null,
            failure_count: 2,
            browser_profile_path: '/profiles/memes-yt',
          },
        ]}
      />,
    )

    expect(screen.getByText('One or more accounts require manual login.')).toBeInTheDocument()
  })
})
