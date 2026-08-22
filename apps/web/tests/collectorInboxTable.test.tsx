import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('@/components/admin/AdminAutoRefresh', () => ({
  AdminAutoRefresh: () => null,
}))

vi.mock('@/app/actions/confirmCollectorInbox', () => ({
  confirmCollectorInboxItem: vi.fn(),
  rejectCollectorInboxItem: vi.fn(),
}))

describe('CollectorInboxTable', () => {
  afterEach(() => cleanup())

  it('puts Confirm and Reject on each unsorted reel', async () => {
    const { CollectorInboxTable } = await import('@/components/admin/CollectorInboxTable')
    render(
      <CollectorInboxTable
        items={[
          {
            id: 'inbox-1',
            source_url: 'https://www.instagram.com/reel/AbC123xyzAB/',
            normalized_source_url: 'https://www.instagram.com/reel/AbC123xyzAB/',
            sender_username: 'crew',
            status: 'pending_niche',
            created_at: '2026-08-18T00:00:00.000Z',
            created_at_label: '4 days ago',
          },
        ]}
        niches={[{ id: 'n1', name: 'Anime', slug: 'anime' }]}
      />,
    )

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeTruthy()
  })
})
