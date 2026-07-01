import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ERROR_CODES } from '@project-api/shared'

const selectMock = vi.fn()
const fromMock = vi.fn()

vi.mock('../src/db/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}))

const NICHE_MEMES = '11111111-1111-4111-8111-111111111111'
const NICHE_ANIME = '22222222-2222-4222-8222-222222222222'
const NICHE_SPORTS = '33333333-3333-4333-8333-333333333333'

const YT_MEMES = 'yt-memes-acct'
const IG_MEMES = 'ig-memes-acct'
const YT_ANIME = 'yt-anime-acct'
const IG_ANIME = 'ig-anime-acct'
const YT_SPORTS = 'yt-sports-acct'
const IG_SPORTS = 'ig-sports-acct'

function mockAccountsForNiche(
  accounts: Array<{
    id: string
    platform: string
    account_label: string
    browser_profile_path?: string | null
    status?: string
  }>,
) {
  const secondEqMock = vi.fn().mockResolvedValue({ data: accounts, error: null })
  const firstEqMock = vi.fn().mockReturnValue({ eq: secondEqMock })
  selectMock.mockReturnValue({ eq: firstEqMock })

  fromMock.mockImplementation((table: string) => {
    if (table === 'platform_accounts') {
      return { select: selectMock }
    }
    throw new Error(`Unexpected table: ${table}`)
  })
}

describe('resolveNicheAccounts', () => {
  beforeEach(() => {
    selectMock.mockReset()
    fromMock.mockReset()
  })

  it('returns YouTube and Instagram accounts when exactly one of each exists for niche', async () => {
    mockAccountsForNiche([
      { id: YT_MEMES, platform: 'youtube', account_label: 'Memes YT', status: 'active' },
      { id: IG_MEMES, platform: 'instagram', account_label: 'Memes IG', status: 'active' },
    ])

    const { resolveNicheAccounts } = await import('../src/uploaders/accountResolver')
    const result = await resolveNicheAccounts(NICHE_MEMES)

    expect(result.youtube.id).toBe(YT_MEMES)
    expect(result.instagram.id).toBe(IG_MEMES)
  })

  it('throws NICHE_ACCOUNT_MAPPING_INVALID when YouTube account is missing', async () => {
    mockAccountsForNiche([
      { id: IG_MEMES, platform: 'instagram', account_label: 'Memes IG', status: 'active' },
    ])

    const { resolveNicheAccounts } = await import('../src/uploaders/accountResolver')

    await expect(resolveNicheAccounts(NICHE_MEMES)).rejects.toMatchObject({
      code: ERROR_CODES.NICHE_ACCOUNT_MAPPING_INVALID,
    })
  })

  it('throws NICHE_ACCOUNT_MAPPING_INVALID when Instagram account is missing', async () => {
    mockAccountsForNiche([
      { id: YT_MEMES, platform: 'youtube', account_label: 'Memes YT', status: 'active' },
    ])

    const { resolveNicheAccounts } = await import('../src/uploaders/accountResolver')

    await expect(resolveNicheAccounts(NICHE_MEMES)).rejects.toMatchObject({
      code: ERROR_CODES.NICHE_ACCOUNT_MAPPING_INVALID,
    })
  })

  it('throws NICHE_ACCOUNT_MAPPING_INVALID when two active YouTube accounts exist for same niche', async () => {
    mockAccountsForNiche([
      { id: YT_MEMES, platform: 'youtube', account_label: 'Memes YT 1', status: 'active' },
      { id: 'yt-memes-dup', platform: 'youtube', account_label: 'Memes YT 2', status: 'active' },
      { id: IG_MEMES, platform: 'instagram', account_label: 'Memes IG', status: 'active' },
    ])

    const { resolveNicheAccounts } = await import('../src/uploaders/accountResolver')

    await expect(resolveNicheAccounts(NICHE_MEMES)).rejects.toMatchObject({
      code: ERROR_CODES.NICHE_ACCOUNT_MAPPING_INVALID,
    })
  })

  it('memes niche resolves YouTube account correctly', async () => {
    mockAccountsForNiche([
      { id: YT_MEMES, platform: 'youtube', account_label: 'Memes Channel', status: 'active' },
      { id: IG_MEMES, platform: 'instagram', account_label: 'Memes IG', status: 'active' },
    ])

    const { resolveNicheAccounts } = await import('../src/uploaders/accountResolver')
    const result = await resolveNicheAccounts(NICHE_MEMES)

    expect(result.youtube.accountLabel).toBe('Memes Channel')
  })

  it('anime niche resolves Instagram account correctly', async () => {
    mockAccountsForNiche([
      { id: YT_ANIME, platform: 'youtube', account_label: 'Anime YT', status: 'active' },
      { id: IG_ANIME, platform: 'instagram', account_label: 'Anime Reels', status: 'active' },
    ])

    const { resolveNicheAccounts } = await import('../src/uploaders/accountResolver')
    const result = await resolveNicheAccounts(NICHE_ANIME)

    expect(result.instagram.accountLabel).toBe('Anime Reels')
  })

  it('sports niche resolves both accounts', async () => {
    mockAccountsForNiche([
      { id: YT_SPORTS, platform: 'youtube', account_label: 'Sports YT', status: 'active' },
      { id: IG_SPORTS, platform: 'instagram', account_label: 'Sports IG', status: 'active' },
    ])

    const { resolveNicheAccounts } = await import('../src/uploaders/accountResolver')
    const result = await resolveNicheAccounts(NICHE_SPORTS)

    expect(result.youtube.id).toBe(YT_SPORTS)
    expect(result.instagram.id).toBe(IG_SPORTS)
  })
})
