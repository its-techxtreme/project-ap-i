/** Mock stack. Docker worker + n8n. Playwright uploads forced off in compose. */
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const compose = path.join(repoRoot, 'infra/docker-compose.yml')

execSync(`docker compose -f "${compose}" --profile full up -d --build`, {
  cwd: repoRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    N8N_WORKER_BASE_URL: 'http://worker:3001',
  },
})
