import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const submitJobActionMock = vi.fn()

vi.mock('@/app/actions/submitJob', () => ({
  submitJobAction: (...args: unknown[]) => submitJobActionMock(...args),
}))

const TEST_NICHES = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Memes', slug: 'memes' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Anime', slug: 'anime' },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Sports', slug: 'sports' },
]

async function renderSubmitForm() {
  const { SubmitForm } = await import('@/app/submit/SubmitForm')
  return render(<SubmitForm niches={TEST_NICHES} />)
}

describe('SubmitForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    submitJobActionMock.mockResolvedValue({
      success: true,
      jobId: 'job-1',
      publicJobCode: 'AP-I-TEST-0001',
      nicheLabel: 'Memes',
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('renders all 5 required fields', async () => {
    await renderSubmitForm()

    expect(screen.getByLabelText('Approved Reel/Short Link')).toBeInTheDocument()
    expect(screen.getByLabelText('Platform')).toBeInTheDocument()
    expect(screen.getByLabelText('Niche')).toBeInTheDocument()
    expect(
      screen.getByRole('checkbox', {
        name: 'I confirm this content is client-approved and we have permission to process and publish it.',
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Load aboard' })).toBeInTheDocument()
  })

  it('disables submit when URL is empty', async () => {
    await renderSubmitForm()
    expect(screen.getByRole('button', { name: 'Load aboard' })).toBeDisabled()
  })

  it('disables submit when rights are not checked', async () => {
    const user = userEvent.setup()
    await renderSubmitForm()

    await user.type(
      screen.getByLabelText('Approved Reel/Short Link'),
      'https://www.youtube.com/shorts/abc',
    )
    await user.selectOptions(screen.getByLabelText('Niche'), TEST_NICHES[0].id)

    expect(screen.getByRole('button', { name: 'Load aboard' })).toBeDisabled()
  })

  it('disables submit when niche is not selected', async () => {
    const user = userEvent.setup()
    await renderSubmitForm()

    await user.type(
      screen.getByLabelText('Approved Reel/Short Link'),
      'https://www.youtube.com/shorts/abc',
    )
    await user.click(
      screen.getByRole('checkbox', {
        name: 'I confirm this content is client-approved and we have permission to process and publish it.',
      }),
    )

    expect(screen.getByRole('button', { name: 'Load aboard' })).toBeDisabled()
  })

  it('auto-fills platform as YouTube for YouTube Shorts URL', async () => {
    const user = userEvent.setup()
    await renderSubmitForm()

    await user.type(
      screen.getByLabelText('Approved Reel/Short Link'),
      'https://www.youtube.com/shorts/abc',
    )

    expect(screen.getByLabelText('Platform')).toHaveValue('youtube')
  })

  it('auto-fills platform as Instagram for Instagram Reel URL', async () => {
    const user = userEvent.setup()
    await renderSubmitForm()

    await user.type(
      screen.getByLabelText('Approved Reel/Short Link'),
      'https://www.instagram.com/reel/abc/',
    )

    expect(screen.getByLabelText('Platform')).toHaveValue('instagram')
  })

  it('shows unsupported domain error for TikTok URL', async () => {
    const user = userEvent.setup()
    await renderSubmitForm()

    await user.type(
      screen.getByLabelText('Approved Reel/Short Link'),
      'https://tiktok.com/@user/video/123',
    )

    expect(
      screen.getByText('Only YouTube and Instagram links are supported.'),
    ).toBeInTheDocument()
  })

  it('allows manual platform change between YouTube and Instagram', async () => {
    const user = userEvent.setup()
    await renderSubmitForm()

    await user.type(
      screen.getByLabelText('Approved Reel/Short Link'),
      'https://www.youtube.com/shorts/abc',
    )
    expect(screen.getByLabelText('Platform')).toHaveValue('youtube')

    await user.selectOptions(screen.getByLabelText('Platform'), 'instagram')
    expect(screen.getByLabelText('Platform')).toHaveValue('instagram')
  })

  it('shows spinner during submission', async () => {
    let resolveSubmit: (value: unknown) => void = () => undefined
    submitJobActionMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSubmit = resolve
        }),
    )

    const user = userEvent.setup()
    await renderSubmitForm()

    await user.type(
      screen.getByLabelText('Approved Reel/Short Link'),
      'https://www.youtube.com/shorts/abc',
    )
    await user.selectOptions(screen.getByLabelText('Niche'), TEST_NICHES[0].id)
    await user.click(
      screen.getByRole('checkbox', {
        name: 'I confirm this content is client-approved and we have permission to process and publish it.',
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Load aboard' }))

    expect(await screen.findByText('Loading aboard…')).toBeInTheDocument()

    resolveSubmit({
      success: true,
      jobId: 'job-1',
      publicJobCode: 'AP-I-TEST-0001',
      nicheLabel: 'Memes',
    })
  })

  it('shows success state with niche and queued status', async () => {
    const user = userEvent.setup()
    await renderSubmitForm()

    await user.type(
      screen.getByLabelText('Approved Reel/Short Link'),
      'https://www.youtube.com/shorts/abc',
    )
    await user.selectOptions(screen.getByLabelText('Niche'), TEST_NICHES[0].id)
    await user.click(
      screen.getByRole('checkbox', {
        name: 'I confirm this content is client-approved and we have permission to process and publish it.',
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Load aboard' }))

    await waitFor(() => {
      expect(
        screen.getByText('Ahem! The content has been loaded on the ship'),
      ).toBeInTheDocument()
    })
    expect(
      screen.getByText('The ship is waiting on the dock, ready to sail!!'),
    ).toBeInTheDocument()
    expect(
      screen.getByText((_, el) => el?.textContent === 'Sea lane: Memes'),
    ).toBeInTheDocument()
    expect(
      screen.getByText((_, el) => el?.textContent === 'Status: Queued at the dock — awaiting crew'),
    ).toBeInTheDocument()
  })

  it('shows error message and keeps URL value on failure', async () => {
    submitJobActionMock.mockResolvedValue({
      success: false,
      error: 'Submission failed. Please try again.',
    })

    const user = userEvent.setup()
    await renderSubmitForm()

    const url = 'https://www.youtube.com/shorts/abc'
    await user.type(screen.getByLabelText('Approved Reel/Short Link'), url)
    await user.selectOptions(screen.getByLabelText('Niche'), TEST_NICHES[0].id)
    await user.click(
      screen.getByRole('checkbox', {
        name: 'I confirm this content is client-approved and we have permission to process and publish it.',
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Load aboard' }))

    expect(
      await screen.findByText('Submission failed. Please try again.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Approved Reel/Short Link')).toHaveValue(url)
  })
})
