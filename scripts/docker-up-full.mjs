/**
 * Mock/dry-run stack: Docker worker + n8n (WORKER_BASE_URL=http://worker:3001).
 * Real Playwright uploads are forced off in compose for the Docker worker.
 */
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
