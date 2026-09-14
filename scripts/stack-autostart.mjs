/** Logon autostart for this user only. Wait for Docker, then stack-up. Skip if worker health is already ok. Log to .stack-autostart.log no secrets. */
import { spawn, execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import http from 'node:http'

import { loadEnvFile, repoRoot } from './lib/env.mjs'

const LOG_FILE = path.join(repoRoot, '.stack-autostart.log')
const LOCK_FILE = path.join(repoRoot, '.stack-autostart.lock')
const PORT = Number(process.env.WORKER_PORT || process.env.PORT || 3001)

/** Max time to wait for Docker after logon (ms). */
const DOCKER_WAIT_MS = 10 * 60_000
/** Poll interval while waiting (ms). */
const POLL_MS = 5_000
/** Delay after Docker is ready before stack:up (lets Desktop settle). */
const SETTLE_MS = 8_000

function stamp() {
  return new Date().toISOString()
}

function log(line) {
  const msg = `[${stamp()}] ${line}`
  try {
    fs.appendFileSync(LOG_FILE, msg + '\n', 'utf8')
  } catch {
    // ignore log write failures
  }
  console.log(msg)
}

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

function workerHealthy() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${PORT}/health`, { timeout: 3_000 }, (res) => {
      res.resume()
      resolve(res.statusCode === 200 || res.statusCode === 503)
    })
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
    req.on('error', () => resolve(false))
  })
}

function dockerReady() {
  try {
    const r = spawn('docker', ['info'], {
      windowsHide: true,
      stdio: 'ignore',
    })
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        try {
          r.kill()
        } catch {
          // ignore
        }
        resolve(false)
      }, 15_000)
      r.on('close', (code) => {
        clearTimeout(t)
        resolve(code === 0)
      })
      r.on('error', () => {
        clearTimeout(t)
        resolve(false)
      })
    })
  } catch {
    return Promise.resolve(false)
  }
}

function findDockerDesktopExe() {
  const candidates = [
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Docker', 'Docker', 'Docker Desktop.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Docker', 'Docker', 'Docker Desktop.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Docker', 'Docker Desktop.exe'),
  ]
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p
  }
  return null
}

function tryLaunchDockerDesktop() {
  const exe = findDockerDesktopExe()
  if (!exe) {
    log('Docker Desktop.exe not found — start Docker Desktop manually')
    return false
  }
  try {
    // User-level launch only; do not request elevation.
    spawn(exe, [], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    }).unref()
    log(`Launched Docker Desktop: ${exe}`)
    return true
  } catch (err) {
    log(`Failed to launch Docker Desktop: ${err instanceof Error ? err.message : String(err)}`)
    return false
  }
}

function processExists(pid) {
  if (!pid) return false
  try {
    if (process.platform === 'win32') {
      const out = execSync(`tasklist /FI "PID eq ${pid}" /NH`, {
        encoding: 'utf8',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      return out.includes(String(pid)) && !/no tasks/i.test(out)
    }
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function acquireLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const oldPid = Number(fs.readFileSync(LOCK_FILE, 'utf8').trim())
      if (processExists(oldPid)) return false
    }
    fs.writeFileSync(LOCK_FILE, String(process.pid), 'utf8')
    return true
  } catch {
    return false
  }
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const raw = fs.readFileSync(LOCK_FILE, 'utf8').trim()
      if (raw === String(process.pid)) fs.unlinkSync(LOCK_FILE)
    }
  } catch {
    // ignore
  }
}

async function waitForDocker() {
  const deadline = Date.now() + DOCKER_WAIT_MS
  let launched = false

  while (Date.now() < deadline) {
    if (await dockerReady()) {
      log('Docker Engine is ready')
      return true
    }
    if (!launched) {
      launched = tryLaunchDockerDesktop()
    }
    log('Waiting for Docker Engine...')
    await sleep(POLL_MS)
  }
  log(`Timed out after ${DOCKER_WAIT_MS / 1000}s waiting for Docker`)
  return false
}

function runStackUp() {
  log('Running stack:up...')
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(repoRoot, 'scripts/stack-up.mjs')], {
      cwd: repoRoot,
      env: process.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })

    const timer = setTimeout(() => {
      log('stack:up timed out after 5 minutes — killing child')
      try {
        child.kill()
      } catch {
        // ignore
      }
      resolve(false)
    }, 5 * 60_000)

    child.on('error', (err) => {
      clearTimeout(timer)
      log(`stack:up spawn error: ${err.message}`)
      resolve(false)
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      const combined = `${stdout}\n${stderr}`
      const safe = combined
        .split(/\r?\n/)
        .filter((line) =>
          /uploads:|chrome:|worker:|n8n:|Stack is up|Starting|Building|freed|PID|===|Next:|ok=|channel=/i.test(
            line,
          ),
        )
        .join('\n')
      if (safe.trim()) log(safe.trim())

      if (code !== 0) {
        log(`stack:up failed (exit ${code})`)
        resolve(false)
        return
      }
      log('stack:up finished OK')
      resolve(true)
    })
  })
}

async function main() {
  log('=== Project AP-I stack autostart ===')
  log(`repo=${repoRoot}`)

  if (process.platform !== 'win32') {
    log('Autostart is intended for Windows logon; continuing anyway')
  }

  if (!acquireLock()) {
    log('Another autostart is already running — exiting')
    process.exit(0)
  }

  process.on('exit', releaseLock)
  process.on('SIGINT', () => {
    releaseLock()
    process.exit(130)
  })

  // Load .env into process for child stack-up (stack-up also loads file itself)
  loadEnvFile()

  if (await workerHealthy()) {
    log(`Worker already healthy on :${PORT} — nothing to do`)
    process.exit(0)
  }

  const okDocker = await waitForDocker()
  if (!okDocker) {
    log('Docker not available — leave job queue in Supabase until next successful start')
    process.exit(1)
  }

  await sleep(SETTLE_MS)

  if (await workerHealthy()) {
    log(`Worker became healthy while waiting — skipping stack:up`)
    process.exit(0)
  }

  const ok = await runStackUp()
  if (!ok) process.exit(1)

  if (await workerHealthy()) {
    log('Autostart complete — worker reachable')
    process.exit(0)
  }

  // stack:up may return 503 as reachable; accept open port as success signal
  if (await isPortOpen(PORT)) {
    log(`Worker port ${PORT} is open (may be degraded) — autostart done`)
    process.exit(0)
  }

  log('Worker did not become reachable after stack:up')
  process.exit(1)
}

main().catch((err) => {
  log(`Fatal: ${err instanceof Error ? err.message : String(err)}`)
  releaseLock()
  process.exit(1)
})
