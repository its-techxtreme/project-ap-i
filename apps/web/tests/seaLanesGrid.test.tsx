import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { SeaLanesGrid } from '@/components/desk/SeaLanesGrid'
import type { NicheMappingRow } from '@/lib/data/adminQueries'

const niches: NicheMappingRow[] = [
  {
    id: 'niche-1',
    name: 'Anime',
    slug: 'anime',
    is_active: true,
    youtube_label: 'Anime YT',
    youtube_status: 'active',
    instagram_label: 'Anime IG',
    instagram_status: 'active',
    youtube: {
      account_label: 'Anime YT',
      status: 'active',
      handle: 'ShonenSnaps',
      profile_url: 'https://www.youtube.com/@ShonenSnaps',
      display_name: 'ShonenSnaps',
      description: 'Anime shorts channel',
      avatar_url: null,
    },
    instagram: {
      account_label: 'Anime IG',
      status: 'active',
      handle: 'ShonenSnaps',
      profile_url: 'https://www.instagram.com/ShonenSnaps/',
      display_name: 'Manga',
      description: '1 Followers, 43 Following',
      avatar_url: null,
    },
  },
]

describe('SeaLanesGrid', () => {
  afterEach(() => cleanup())

  it('renders niche slug, live names, handles, and profile links', () => {
    render(<SeaLanesGrid niches={niches} />)

    expect(screen.getByText('Anime')).toBeTruthy()
    expect(screen.getByText(/slug · anime/i)).toBeTruthy()
    expect(screen.getByText('ShonenSnaps')).toBeTruthy()
    expect(screen.getByText('Manga')).toBeTruthy()
    expect(screen.getAllByText('@ShonenSnaps').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Anime shorts channel')).toBeTruthy()
    expect(screen.getAllByRole('link', { name: /open profile/i })).toHaveLength(2)
    expect(screen.getAllByText('active').length).toBeGreaterThanOrEqual(2)
  })

  it('shows the collector IG profile and login required', () => {
    render(
      <SeaLanesGrid
        niches={niches}
        collector={{
          account_label: 'Collector IG',
          status: 'login_required',
          handle: null,
          profile_url: null,
          display_name: 'Collector IG',
          description: 'Login required on the ig-collector Playwright profile.',
          avatar_url: null,
          login_required: true,
        }}
      />,
    )
    expect(screen.getByText('Collector')).toBeTruthy()
    expect(screen.getByText(/slug · collector/i)).toBeTruthy()
    expect(screen.getAllByText(/login required/i).length).toBeGreaterThanOrEqual(1)
  })
})
