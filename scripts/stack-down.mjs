/** Stop native worker plus Docker n8n (and optional Docker worker). */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { repoRoot } from './lib/env.mjs'

const PID_FILE = path.join(repoRoot, '.stack-worker.pid')
const COMPOSE_FILE = path.join(repoRoot, 'infra/docker-compose.yml')

function stopTrackedWorker() {
  if (!fs.existsSync(PID_FILE)) {
    console.log('No tracked worker PID file.')
    return
  }
  const pid = Number(fs.readFileSync(PID_FILE, 'utf8').trim())
  if (pid) {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' })
      } else {
        process.kill(pid, 'SIGTERM')
      }
      console.log(`Stopped worker PID ${pid}`)
    } catch {
      console.log(`Worker PID ${pid} already stopped`)
    }
  }
  fs.unlinkSync(PID_FILE)
}

console.log('=== Project AP-I stack:down ===')
stopTrackedWorker()

try {
  execSync(`docker compose -f "${COMPOSE_FILE}" --profile full down`, {
    cwd: repoRoot,
    stdio: 'inherit',
  })
} catch {
  execSync(`docker compose -f "${COMPOSE_FILE}" down`, {
    cwd: repoRoot,
    stdio: 'inherit',
  })
}

console.log('Stack down.')
