/** Poll Supabase after a web submit. Not a DB insert helper. */
import process from 'node:process'

const jobId = process.argv[2]
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!jobId) {
  console.error('Usage: node --env-file=.env scripts/watch-job.mjs <job-uuid>')
  process.exit(1)
}
if (!supabaseUrl || !serviceKey) {
  console.error('Missing SUPABASE URL / SERVICE_ROLE_KEY')
  process.exit(1)
}

const fields =
  'id,status,download_status,processing_status,metadata_status,youtube_upload_status,instagram_upload_status,verification_status,failure_code,failure_reason,youtube_url,instagram_url,drive_file_id,updated_at'

async function fetchJob() {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/jobs?id=eq.${jobId}&select=${fields}`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    },
  )
  if (!res.ok) throw new Error(`jobs fetch ${res.status}: ${await res.text()}`)
  const rows = await res.json()
  return rows[0] ?? null
}

const terminal = new Set(['completed', 'failed', 'needs_manual_review', 'cancelled', 'ignored'])
let last = ''

for (let i = 0; i < 180; i++) {
  const job = await fetchJob()
  if (!job) {
    console.error('Job not found:', jobId)
    process.exit(1)
  }
  const line = [
    job.status,
    `dl=${job.download_status}`,
    `proc=${job.processing_status}`,
    `meta=${job.metadata_status}`,
    `yt=${job.youtube_upload_status}`,
    `ig=${job.instagram_upload_status}`,
    `ver=${job.verification_status}`,
    job.failure_code || '',
    (job.failure_reason || '').slice(0, 80),
  ].join(' | ')
  if (line !== last) {
    console.log(new Date().toISOString(), line)
    if (job.youtube_url) console.log('  YT', job.youtube_url)
    if (job.instagram_url) console.log('  IG', job.instagram_url)
    last = line
  }
  if (terminal.has(job.status) && !['uploading', 'processing', 'queued', 'paused'].includes(job.status)) {
    // verification may still be pending after upload — keep waiting if status is uploaded-ish
  }
  if (['completed', 'failed', 'needs_manual_review', 'cancelled', 'ignored'].includes(job.status)) {
    process.exit(job.status === 'completed' ? 0 : 2)
  }
  await new Promise((r) => setTimeout(r, 10000))
}

console.error('Timed out watching job')
process.exit(3)
