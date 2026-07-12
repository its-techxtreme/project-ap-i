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
  bulkRetryJobUploads: vi.fn().mockResolvedValue({
    success: true,
    succeeded: 1,
    failed: 0,
    errors: [],
    message: '1 job(s) queued for retry.',
  }),
  bulkDeleteDriveFiles: vi.fn().mockResolvedValue({
    success: true,
    succeeded: 1,
    failed: 0,
    errors: [],
    message: '1 job(s) queued for Drive delete.',
  }),
  bulkMarkJobsIgnored: vi.fn().mockResolvedValue({
    success: true,
    succeeded: 1,
    failed: 0,
    errors: [],
    message: '1 job(s) marked ignored.',
  }),
  markAccountLoginRecovered: vi.fn().mockResolvedValue({
    success: true,
    accountId: 'acc-1',
    message: 'Account marked login recovered (active).',
  }),
  pausePlatformAccount: vi.fn().mockResolvedValue({
    success: true,
    accountId: 'acc-1',
    message: 'Account paused.',
  }),
  resumePlatformAccount: vi.fn().mockResolvedValue({
    success: true,
    accountId: 'acc-1',
    message: 'Account resumed (active).',
  }),
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

    for (const label of [
      'Queued',
      'Processing',
      'Completed today',
      'Failed today',
      'Needs review',
      'Login required',
      'Drive cleanup',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
  }, 15_000)
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
            youtube_url: null,
            instagram_url: null,
            drive_view_url: null,
            retry_count: 0,
            failure_reason: null,
            source_url: 'https://www.youtube.com/shorts/abc',
            queue_position: 1,
          },
        ]}
      />,
    )

    const headers = screen.getAllByRole('columnheader').map((el) => el.textContent)
    expect(headers).toEqual([
      'Queue',
      'Job',
      'Created',
      'Source',
      'Niche',
      'Status',
      'YouTube',
      'Instagram',
      'Links',
      'Retries',
      'Failure',
      'Actions',
    ])
    expect(screen.getByLabelText('View details')).toBeInTheDocument()
    expect(screen.getByLabelText('Retry upload')).toBeInTheDocument()
    expect(screen.getByLabelText('Cancel job')).toBeInTheDocument()
  }, 15_000)

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
    expect(badge.className).toContain('bg-emerald-500/15')
  })

  it("renders 'needs_manual_review' as orange", async () => {
    const { StatusBadge } = await import('@/components/app/StatusBadge')
    render(<StatusBadge status="needs_manual_review" />)
    const badge = screen.getByLabelText('Status: needs manual review')
    expect(badge.className).toContain('bg-orange-500/15')
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
            youtube_url: null,
            instagram_url: null,
            drive_view_url: null,
            retry_count: 1,
            failure_reason: 'Upload failed',
            failure_code: 'YOUTUBE_UPLOAD_FAILED',
            source_url: 'https://www.youtube.com/shorts/abc',
            queue_position: null,
          },
        ]}
      />,
    )

    expect(screen.queryByText('Retry Selected')).not.toBeInTheDocument()
    await screen.findByRole('checkbox', { name: /Select job aaaaaaaa/i }).then((checkbox) => {
      fireEvent.click(checkbox)
    })
    expect(screen.getByText('Retry Selected')).toBeInTheDocument()
    expect(screen.getByText('Delete Selected Drive Files')).toBeInTheDocument()
    expect(screen.getByText('Mark Selected Ignored')).toBeInTheDocument()
    expect(screen.queryByText(/Coming in Phase 11/i)).not.toBeInTheDocument()
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
    expect(screen.getByText('Mark Login Recovered')).toBeInTheDocument()
    expect(screen.getByText('Pause')).toBeInTheDocument()
    expect(screen.getByText('Resume')).toBeInTheDocument()
    expect(screen.queryByText(/\(stub\)/i)).not.toBeInTheDocument()
  })
})
