/**
 * Poll a job until terminal status or timeout.
 * Usage: node --env-file=.env scripts/watch-job.mjs <jobId> [--timeout-min 45]
 */
import { loadEnvFile, requireEnv } from './lib/env.mjs'

const env = loadEnvFile()
const supabaseUrl = requireEnv(env, 'SUPABASE_URL').replace(/\/$/, '')
const key = requireEnv(env, 'SUPABASE_SERVICE_ROLE_KEY')
const jobId = process.argv[2]
const timeoutMin = Number(process.argv.includes('--timeout-min')
  ? process.argv[process.argv.indexOf('--timeout-min') + 1]
  : 45)

if (!jobId) {
  console.error('Usage: node scripts/watch-job.mjs <jobId>')
  process.exit(1)
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
}

const terminal = new Set(['completed', 'failed', 'needs_manual_review', 'ignored'])
const started = Date.now()
let last = ''

while (Date.now() - started < timeoutMin * 60_000) {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/jobs?id=eq.${jobId}&select=id,status,youtube_upload_status,instagram_upload_status,drive_folder_state,failure_code,failure_reason,verification_due_at,updated_at`,
    { headers },
  )
  const rows = await res.json()
  const job = rows[0]
  if (!job) {
    console.error('Job not found')
    process.exit(1)
  }
  const line = `${job.status} yt=${job.youtube_upload_status} ig=${job.instagram_upload_status} drive=${job.drive_folder_state}${job.failure_code ? ' code=' + job.failure_code : ''}`
  if (line !== last) {
    console.log(new Date().toISOString(), line)
    last = line
  }
  if (terminal.has(job.status)) {
    console.log(JSON.stringify(job, null, 2))
    process.exit(job.status === 'completed' ? 0 : 2)
  }
  await new Promise((r) => setTimeout(r, 15_000))
}

console.error('Timeout waiting for job')
process.exit(3)
