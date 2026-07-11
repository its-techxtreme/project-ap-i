/**
 * Canonical unattended stack:
 *   Docker n8n → host.docker.internal:3001
 *   Native worker (built dist) on host with Chrome profiles
 *
 * Usage: node scripts/stack-up.mjs
 */
import { spawn, execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'

import { loadEnvFile, repoRoot } from './lib/env.mjs'

const PID_FILE = path.join(repoRoot, '.stack-worker.pid')
const COMPOSE_FILE = path.join(repoRoot, 'infra/docker-compose.yml')
const PORT = Number(process.env.WORKER_PORT || process.env.PORT || 3001)

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' }, () => {
      socket.end()
      resolve(true)
    })
    socket.on('error', () => resolve(false))
  })
}

function killPortOccupant(port) {
  if (process.platform === 'win32') {
    try {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' })
      const pids = new Set()
      for (const line of out.split(/\r?\n/)) {
        if (!line.includes('LISTENING')) continue
        const parts = line.trim().split(/\s+/)
        const pid = parts[parts.length - 1]
        if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid)
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' })
          console.log(`  freed port ${port} (killed PID ${pid})`)
        } catch {
          // ignore
        }
      }
    } catch {
      // nothing listening
    }
    return
  }

  try {
    const out = execSync(`lsof -ti :${port}`, { encoding: 'utf8' }).trim()
    for (const pid of out.split(/\n/).filter(Boolean)) {
      try {
        process.kill(Number(pid), 'SIGTERM')
        console.log(`  freed port ${port} (killed PID ${pid})`)
      } catch {
        // ignore
      }
    }
  } catch {
    // nothing listening
  }
}

function stopTrackedWorker() {
  if (!fs.existsSync(PID_FILE)) return
  const pid = Number(fs.readFileSync(PID_FILE, 'utf8').trim())
  if (!pid) return
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' })
    } else {
      process.kill(pid, 'SIGTERM')
    }
    console.log(`  stopped previous worker PID ${pid}`)
  } catch {
    // already dead
  }
  fs.unlinkSync(PID_FILE)
}

async function waitForHealth(_token, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/health`)
      // 200 = healthy, 503 = reachable but degraded (still usable for diagnosis)
      if (res.status === 200 || res.status === 503) {
        return await res.json()
      }
    } catch {
      // retry until process binds
    }
    await sleep(500)
  }
  throw new Error(`Worker health check failed on port ${PORT}`)
}

async function main() {
  const env = loadEnvFile()
  console.log('=== Project AP-I stack:up ===')

  // 1) Free port + stop previous tracked worker
  stopTrackedWorker()
  if (await isPortOpen(PORT)) {
    console.log(`Port ${PORT} in use — freeing...`)
    killPortOccupant(PORT)
    await sleep(1000)
  }

  // 2) Start n8n only (points at host.docker.internal)
  console.log('Starting Docker n8n...')
  execSync(`docker compose -f "${COMPOSE_FILE}" up -d n8n`, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...env,
      N8N_WORKER_BASE_URL: env.N8N_WORKER_BASE_URL || 'http://host.docker.internal:3001',
    },
  })

  // 3) Ensure Docker worker is not occupying 3001
  try {
    execSync(`docker compose -f "${COMPOSE_FILE}" stop worker`, {
      cwd: repoRoot,
      stdio: 'ignore',
    })
  } catch {
    // worker profile may not be running
  }

  // 4) Start native worker via tsx (shared package exports TypeScript source)
  const watermarkDefault = path.join(repoRoot, 'apps/worker/assets/watermark.png')
  const tmpDefault = path.join(repoRoot, 'apps/worker/tmp/jobs')
  const profilesDefault = path.join(repoRoot, 'playwright-profiles')
  const workerDir = path.join(repoRoot, 'apps/worker')
  const tsxCli = path.join(workerDir, 'node_modules/tsx/dist/cli.mjs')
  const tsxBin = fs.existsSync(tsxCli)
    ? tsxCli
    : path.join(repoRoot, 'node_modules/tsx/dist/cli.mjs')

  // Ensure WinGet package bins are visible to the detached worker (PATH often incomplete).
  const winGetPackages = path.join(
    process.env.LOCALAPPDATA || '',
    'Microsoft',
    'WinGet',
    'Packages',
  )
  let ytDlpPath = env.YT_DLP_PATH
  try {
    if (!ytDlpPath && fs.existsSync(winGetPackages)) {
      for (const dir of fs.readdirSync(winGetPackages)) {
        if (!dir.toLowerCase().includes('yt-dlp')) continue
        const candidate = path.join(winGetPackages, dir, 'yt-dlp.exe')
        if (fs.existsSync(candidate)) {
          ytDlpPath = candidate
          break
        }
      }
    }
  } catch {
    // ignore
  }

  const workerEnv = {
    ...env,
    PORT: String(PORT),
    WATERMARK_PATH: env.WATERMARK_PATH?.startsWith('/app/')
      ? watermarkDefault
      : env.WATERMARK_PATH || watermarkDefault,
    TMP_DIR: env.TMP_DIR?.startsWith('/app/') ? tmpDefault : env.TMP_DIR || tmpDefault,
    PLAYWRIGHT_CHANNEL: env.PLAYWRIGHT_CHANNEL || 'chrome',
    PLAYWRIGHT_PROFILES_DIR: env.PLAYWRIGHT_PROFILES_DIR || profilesDefault,
    ...(ytDlpPath ? { YT_DLP_PATH: ytDlpPath } : {}),
    PATH: [path.dirname(ytDlpPath || ''), process.env.PATH].filter(Boolean).join(path.delimiter),
  }

  const logPath = path.join(repoRoot, '.stack-worker.log')
  const logFd = fs.openSync(logPath, 'w')

  console.log('Starting native worker (tsx)...')
  const child = spawn(
    process.execPath,
    [tsxBin, '--env-file=../../.env', 'src/index.ts'],
    {
      cwd: workerDir,
      env: workerEnv,
      detached: true,
      stdio: ['ignore', logFd, logFd],
      windowsHide: true,
    },
  )
  child.unref()
  try {
    fs.closeSync(logFd)
  } catch {
    // ignore
  }
  fs.writeFileSync(PID_FILE, String(child.pid), 'utf8')
  console.log(`  worker PID ${child.pid} (tracked in .stack-worker.pid)`)
  console.log(`  worker log: .stack-worker.log`)

  let health
  try {
    health = await waitForHealth(env.WORKER_INTERNAL_TOKEN)
  } catch (err) {
    if (fs.existsSync(logPath)) {
      console.error('\nWorker log tail:')
      console.error(fs.readFileSync(logPath, 'utf8').slice(-2000))
    }
    throw err
  }
  // 5) Re-activate n8n pollers (Docker restarts often leave workflows inactive)
  await ensureN8nWorkflowsActive(env)

  console.log('\nStack is up:')
  console.log(`  worker:  http://127.0.0.1:${PORT}/health  ok=${health.ok}`)
  console.log(`  n8n:     http://localhost:5678`)
  console.log(`  uploads: real=${health.realUploadsEnabled} yt=${health.youtubeUploadsEnabled} ig=${health.instagramUploadsEnabled}`)
  console.log(`  chrome:  channel=${health.checks?.playwrightChannel}`)
  console.log('\nNext: pnpm stack:status')
}

async function waitForN8n(baseUrl, attempts = 30) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(baseUrl)
      if (res.ok || res.status === 401 || res.status === 200) return
    } catch {
      // retry
    }
    await sleep(1000)
  }
}

async function ensureN8nWorkflowsActive(env) {
  const apiKey = env.N8N_API_KEY
  if (!apiKey || apiKey === 'REPLACE_ME') {
    console.log('  n8n: skip workflow activate (N8N_API_KEY not set)')
    return
  }

  const baseUrl = (env.N8N_API_BASE_URL || env.WEBHOOK_URL || 'http://localhost:5678/').replace(
    /\/$/,
    '',
  )

  try {
    await waitForN8n(baseUrl)
    const { createN8nClient, listWorkflows, publishWorkflow } = await import('./lib/n8n-api.mjs')
    const client = createN8nClient(env)
    const activateNames = [
      'WF-03 Upload Verification',
      'WF-02 Process Job',
      'WF-01 New Job Poller',
      'WF-04 Manual Retry Webhook',
      'WF-05 Drive Cleanup Webhook',
      'WF-07 Admin Command Poller',
      'WF-08 Verification Cron',
    ]
    const workflows = await listWorkflows(client)
    let activated = 0
    for (const name of activateNames) {
      const wf = workflows.find((w) => w.name === name)
      if (!wf) continue
      if (wf.active) {
        activated += 1
        continue
      }
      try {
        await publishWorkflow(client, wf.id)
        activated += 1
        console.log(`  n8n: activated ${name}`)
      } catch (err) {
        console.warn(`  n8n: could not activate ${name} — ${err.message}`)
        console.warn('         run: pnpm n8n:setup')
      }
    }
    console.log(`  n8n: ${activated}/${activateNames.length} critical workflows active`)
  } catch (err) {
    console.warn(`  n8n: workflow activate skipped — ${err.message || err}`)
    console.warn('         run: pnpm n8n:setup')
  }
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
