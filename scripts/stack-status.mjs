/**
 * Report worker health, upload flags, n8n reachability.
 * Usage: node scripts/stack-status.mjs
 */
import { loadEnvFile } from './lib/env.mjs'

const env = loadEnvFile()
const port = Number(env.WORKER_PORT || env.PORT || 3001)

async function check(url, headers = {}) {
  try {
    const res = await fetch(url, { headers })
    return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

async function main() {
  console.log('=== Project AP-I stack:status ===')

  const health = await check(`http://127.0.0.1:${port}/health`)
  if (!health.ok) {
    console.log(`worker: OFFLINE (${health.error || health.status})`)
  } else {
    const h = health.body
    const checks = h.checks || {}
    console.log(`worker: OK  version=${h.version} env=${h.env}`)
    console.log(`  realUploads=${h.realUploadsEnabled} yt=${h.youtubeUploadsEnabled} ig=${h.instagramUploadsEnabled}`)
    console.log(`  ffmpeg=${checks.ffmpeg?.ok ?? checks.ffmpeg} ytDlp=${checks.ytDlp?.ok ?? checks.ytDlp}`)
    console.log(`  disk=${checks.disk?.ok ?? checks.disk} supabase=${checks.supabase?.ok ?? checks.supabase}`)
    console.log(`  playwright=${checks.playwright} channel=${checks.playwrightChannel}`)
    if (h.realUploadsEnabled && checks.playwrightChannel !== 'chrome') {
      console.log('  WARNING: real uploads require PLAYWRIGHT_CHANNEL=chrome')
    }
  }

  const n8n = await check('http://127.0.0.1:5678/healthz')
  if (n8n.ok) {
    console.log('n8n:    OK  http://localhost:5678')
  } else {
    // older n8n may not have /healthz
    const ui = await check('http://127.0.0.1:5678/')
    console.log(ui.ok || ui.status ? `n8n:    REACHABLE (status=${ui.status || 'ok'})` : `n8n:    OFFLINE (${n8n.error || ui.error})`)
  }

  console.log(`env file flags: REAL_UPLOADS_ENABLED=${env.REAL_UPLOADS_ENABLED}`)
  console.log(`                PLAYWRIGHT_CHANNEL=${env.PLAYWRIGHT_CHANNEL || '(unset)'}`)
  console.log(`                VERIFY_DELAY_MINUTES=${env.VERIFY_DELAY_MINUTES || '30'}`)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
