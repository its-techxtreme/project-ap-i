/**
 * Insert one queued test job for worker integration testing.
 * Usage: node --env-file=.env apps/worker/scripts/seed-test-job.mjs
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data: niche, error: nicheError } = await supabase
  .from('niches')
  .select('id, slug')
  .eq('slug', 'memes')
  .eq('is_active', true)
  .single()

if (nicheError || !niche) {
  console.error('Failed to load memes niche:', nicheError?.message)
  process.exit(1)
}

const unique = Date.now()
const sourceUrl = `https://www.youtube.com/shorts/smoke-test-${unique}`

const { data: job, error: insertError } = await supabase
  .from('jobs')
  .insert({
    source_url: sourceUrl,
    normalized_source_url: sourceUrl,
    source_platform: 'youtube',
    niche_id: niche.id,
    rights_confirmed: true,
    status: 'queued',
  })
  .select('id, status, public_job_code')
  .single()

if (insertError || !job) {
  console.error('Failed to insert test job:', insertError?.message)
  process.exit(1)
}

console.log(JSON.stringify({ ok: true, jobId: job.id, status: job.status, publicJobCode: job.public_job_code }))
