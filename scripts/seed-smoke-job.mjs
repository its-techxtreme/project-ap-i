/** One real queued job for unattended smoke. Agency-owned short URL. */
import { loadEnvFile, requireEnv } from './lib/env.mjs'

const env = loadEnvFile()
const supabaseUrl = requireEnv(env, 'SUPABASE_URL').replace(/\/$/, '')
const key = requireEnv(env, 'SUPABASE_SERVICE_ROLE_KEY')

const args = process.argv.slice(2)
function arg(name, fallback) {
  const idx = args.indexOf(name)
  if (idx === -1) return fallback
  return args[idx + 1] ?? fallback
}

const sourceUrl = arg('--url', process.env.SMOKE_SOURCE_URL)
const nicheSlug = arg('--niche', 'anime')

if (!sourceUrl) {
  console.error('Missing --url or SMOKE_SOURCE_URL')
  process.exit(1)
}

const platform = sourceUrl.includes('instagram.com')
  ? 'instagram'
  : sourceUrl.includes('youtu')
    ? 'youtube'
    : null

if (!platform) {
  console.error('URL must be youtube or instagram')
  process.exit(1)
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
}

const nicheRes = await fetch(
  `${supabaseUrl}/rest/v1/niches?slug=eq.${encodeURIComponent(nicheSlug)}&is_active=eq.true&select=id,slug`,
  { headers },
)
const niches = await nicheRes.json()
const niche = Array.isArray(niches) ? niches[0] : null
if (!niche) {
  console.error('Failed to load niche', niches)
  process.exit(1)
}

const normalized = sourceUrl.split('?')[0].replace(/\/$/, '')

const insertRes = await fetch(`${supabaseUrl}/rest/v1/jobs`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    source_url: sourceUrl,
    normalized_source_url: normalized,
    source_platform: platform,
    niche_id: niche.id,
    rights_confirmed: true,
    status: 'queued',
  }),
})
const jobs = await insertRes.json()
const job = Array.isArray(jobs) ? jobs[0] : jobs
if (!insertRes.ok || !job?.id) {
  console.error('Failed to insert smoke job:', jobs)
  process.exit(1)
}

console.log(
  JSON.stringify(
    {
      ok: true,
      jobId: job.id,
      status: job.status,
      publicJobCode: job.public_job_code,
      niche: nicheSlug,
      platform,
      sourceUrl,
    },
    null,
    2,
  ),
)
