/**
 * Upsert platform_accounts with browser_profile_path for all 6 niche/platform pairs.
 * Usage: node --env-file=.env apps/worker/scripts/set-browser-profile-paths.mjs
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../../..')

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const profilesDir =
  process.env.PLAYWRIGHT_PROFILES_DIR?.trim() ||
  path.join(REPO_ROOT, 'playwright-profiles').replace(/\\/g, '/')

const ACCOUNT_SPECS = [
  { nicheSlug: 'memes', platform: 'youtube', accountLabel: 'Memes YT', folder: 'memes-yt' },
  { nicheSlug: 'memes', platform: 'instagram', accountLabel: 'Memes IG', folder: 'memes-ig' },
  { nicheSlug: 'anime', platform: 'youtube', accountLabel: 'Anime YT', folder: 'anime-yt' },
  { nicheSlug: 'anime', platform: 'instagram', accountLabel: 'Anime IG', folder: 'anime-ig' },
  { nicheSlug: 'sports', platform: 'youtube', accountLabel: 'Sports YT', folder: 'sports-yt' },
  { nicheSlug: 'sports', platform: 'instagram', accountLabel: 'Sports IG', folder: 'sports-ig' },
]

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data: niches, error: nichesError } = await supabase
  .from('niches')
  .select('id, slug')
  .in('slug', ['memes', 'anime', 'sports'])

if (nichesError || !niches?.length) {
  console.error('Failed to load niches:', nichesError?.message ?? 'no rows')
  process.exit(1)
}

const nicheBySlug = Object.fromEntries(niches.map((n) => [n.slug, n.id]))

let failed = false

for (const spec of ACCOUNT_SPECS) {
  const nicheId = nicheBySlug[spec.nicheSlug]
  if (!nicheId) {
    console.error(`FAIL: niche not found: ${spec.nicheSlug}`)
    failed = true
    continue
  }

  const profilePath = `${profilesDir.replace(/\\/g, '/')}/${spec.folder}`

  const { data, error } = await supabase
    .from('platform_accounts')
    .upsert(
      {
        niche_id: nicheId,
        platform: spec.platform,
        account_label: spec.accountLabel,
        browser_profile_path: profilePath,
        status: 'active',
        login_required: false,
        failure_count: 0,
      },
      { onConflict: 'niche_id,platform' },
    )
    .select('id, account_label, platform, browser_profile_path')
    .single()

  if (error) {
    console.error(`FAIL: ${spec.nicheSlug} ${spec.platform}:`, error.message)
    failed = true
    continue
  }

  console.log(`OK: ${data.account_label} (${data.platform}) -> ${data.browser_profile_path}`)
}

if (failed) {
  process.exit(1)
}

console.log(`\nAll 6 platform_accounts updated. Profiles dir: ${profilesDir}`)
