import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const repoRoot = path.resolve(__dirname, '../..')

export function loadEnvFile(envPath = path.join(repoRoot, '.env')) {
  const env = { ...process.env }
  if (!fs.existsSync(envPath)) return env
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx)
    const value = trimmed.slice(idx + 1)
    if (env[key] === undefined) env[key] = value
  }
  return env
}

export function requireEnv(env, key) {
  const value = env[key]
  if (!value || value === 'REPLACE_ME' || String(value).trim() === '') {
    throw new Error(`Missing ${key} in .env`)
  }
  return value
}
