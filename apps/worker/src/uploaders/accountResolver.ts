import { ERROR_CODES, ProjectApiError } from '@project-api/shared'

import { supabaseAdmin } from '../db/supabaseAdmin'
import { logger } from '../logging/logger'

import type { ResolvedAccounts } from './types'

interface PlatformAccountRow {
  id: string
  platform: string
  account_label: string
  browser_profile_path: string | null
  status: string
}

/** Exactly one active YT and one active IG for the niche. Else NICHE_ACCOUNT_MAPPING_INVALID. */
export async function resolveNicheAccounts(nicheId: string): Promise<ResolvedAccounts> {
  const { data: accounts, error } = await supabaseAdmin
    .from('platform_accounts')
    .select('id, platform, account_label, browser_profile_path, status')
    .eq('niche_id', nicheId)
    .eq('status', 'active')

  if (error) {
    throw new ProjectApiError(
      ERROR_CODES.NICHE_ACCOUNT_NOT_FOUND,
      `Failed to query accounts: ${error.message}`,
    )
  }

  const rows = (accounts ?? []) as PlatformAccountRow[]
  const youtubeAccounts = rows.filter((a) => a.platform === 'youtube')
  const instagramAccounts = rows.filter((a) => a.platform === 'instagram')

  if (youtubeAccounts.length !== 1) {
    logger.error({ msg: 'Invalid YouTube account mapping', nicheId, count: youtubeAccounts.length })
    throw new ProjectApiError(
      ERROR_CODES.NICHE_ACCOUNT_MAPPING_INVALID,
      `Expected exactly 1 active YouTube account for niche, found ${youtubeAccounts.length}`,
      { stage: 'upload' },
    )
  }

  if (instagramAccounts.length !== 1) {
    logger.error({ msg: 'Invalid Instagram account mapping', nicheId, count: instagramAccounts.length })
    throw new ProjectApiError(
      ERROR_CODES.NICHE_ACCOUNT_MAPPING_INVALID,
      `Expected exactly 1 active Instagram account for niche, found ${instagramAccounts.length}`,
      { stage: 'upload' },
    )
  }

  return {
    youtube: {
      id: youtubeAccounts[0].id,
      accountLabel: youtubeAccounts[0].account_label,
      browserProfilePath: youtubeAccounts[0].browser_profile_path ?? undefined,
    },
    instagram: {
      id: instagramAccounts[0].id,
      accountLabel: instagramAccounts[0].account_label,
      browserProfilePath: instagramAccounts[0].browser_profile_path ?? undefined,
    },
  }
}
