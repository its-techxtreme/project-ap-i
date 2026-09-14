/** Phase 4 live check against remote Supabase. Dev only. */
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey || serviceKey.includes('REPLACE_ME')) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const TEST_EMAIL = 'phase4-dev-submitter@project-ap-i.local'
const TEST_PASSWORD = 'Phase4DevTest!2026'
const TEST_URL = `https://www.youtube.com/shorts/phase4-live-${Date.now()}`

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function ensureTestUser() {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 })
  const existing = list?.users?.find((u) => u.email === TEST_EMAIL)
  if (existing) return existing.id

  const { data, error } = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  })
  if (error) throw error
  return data.user.id
}

async function main() {
  console.log('Phase 4 live verification starting...\n')

  const userId = await ensureTestUser()
  console.log('✓ Test submitter user ready')

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()
  assert(profile?.role === 'submitter', `Expected submitter profile, got ${profile?.role}`)
  console.log('✓ Profile auto-created with role submitter')

  const { data: niches, error: nichesError } = await admin
    .from('niches')
    .select('id, name, slug')
    .eq('is_active', true)
    .order('name')

  assert(!nichesError, `Niches query failed: ${nichesError?.message}`)
  assert(niches?.length === 3, `Expected 3 active niches, got ${niches?.length ?? 0}`)
  const slugs = niches.map((n) => n.slug).sort()
  assert(
    JSON.stringify(slugs) === JSON.stringify(['anime', 'memes', 'sports']),
    `Unexpected niches: ${slugs.join(', ')}`,
  )
  console.log('✓ Active niches: Memes, Anime, Sports')

  const memes = niches.find((n) => n.slug === 'memes')
  assert(memes, 'Memes niche not found')

  const normalizedUrl = TEST_URL

  const { data: job, error: insertError } = await admin
    .from('jobs')
    .insert({
      submitted_by: userId,
      source_url: normalizedUrl,
      normalized_source_url: normalizedUrl,
      source_platform: 'youtube',
      niche_id: memes.id,
      rights_confirmed: true,
      status: 'queued',
    })
    .select(
      'id, public_job_code, status, rights_confirmed, target_youtube_account_id, target_instagram_account_id',
    )
    .single()

  assert(!insertError && job, `Job insert failed: ${insertError?.message}`)
  assert(job.status === 'queued', `Expected status queued, got ${job.status}`)
  assert(job.rights_confirmed === true, 'rights_confirmed must be true')
  assert(job.target_youtube_account_id == null, 'target_youtube_account_id must not be set')
  assert(job.target_instagram_account_id == null, 'target_instagram_account_id must not be set')
  console.log(`✓ Job inserted (id: ${job.id}, status: queued)`)

  const { error: auditError } = await admin.from('audit_logs').insert({
    actor_user_id: userId,
    actor_type: 'user',
    action: 'job_created',
    target_type: 'job',
    target_id: job.id,
    metadata: { niche: memes.slug, platform: 'youtube', live_test: true },
  })
  assert(!auditError, `Audit log insert failed: ${auditError?.message}`)
  console.log('✓ Audit log written')

  const { data: duplicate } = await admin
    .from('jobs')
    .select('id, status')
    .eq('normalized_source_url', normalizedUrl)
    .eq('niche_id', memes.id)
    .not('status', 'in', '("completed","ignored","failed")')
    .limit(1)
    .maybeSingle()

  assert(duplicate?.id === job.id, 'Duplicate detection query should find active job')
  console.log('✓ Duplicate URL+niche detection would block re-submission')

  const { data: rightsFail, error: rightsFailError } = await admin
    .from('jobs')
    .insert({
      submitted_by: userId,
      source_url: `https://www.youtube.com/shorts/rights-fail-${Date.now()}`,
      source_platform: 'youtube',
      niche_id: memes.id,
      rights_confirmed: false,
      status: 'queued',
    })
    .select('id')
    .maybeSingle()

  assert(rightsFailError || !rightsFail, 'DB must reject rights_confirmed=false')
  console.log('✓ Database rejects rights_confirmed=false')

  await admin.from('audit_logs').delete().eq('target_id', job.id)
  await admin.from('jobs').delete().eq('id', job.id)
  console.log('✓ Test job cleaned up')

  console.log('\nPhase 4 live verification PASSED')
  console.log('\nManual UI test credentials (dev only):')
  console.log(`  Email:    ${TEST_EMAIL}`)
  console.log(`  Password: ${TEST_PASSWORD}`)
  console.log('  Run: pnpm --filter @project-api/web dev → http://localhost:3000/login')
}

main().catch((err) => {
  console.error('\nPhase 4 live verification FAILED')
  console.error(err.message ?? err)
  process.exit(1)
})
