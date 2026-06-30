/**
 * Fill local-dev placeholders in .env (idempotent).
 * Does NOT overwrite real secrets — only REPLACE_ME or empty values.
 *
 * Usage: node scripts/setup-local-env.mjs
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.resolve(__dirname, '../.env')

if (!fs.existsSync(envPath)) {
  console.error('Missing .env — copy .env.example first.')
  process.exit(1)
}

const defaults = {
  WORKER_BASE_URL: 'http://localhost:3001',
  WORKER_PORT: '3001',
  N8N_HOST: 'localhost',
  N8N_PROTOCOL: 'http',
  WEBHOOK_URL: 'http://localhost:5678/',
  GENERIC_TIMEZONE: 'UTC',
  AI_PROVIDER_BASE_URL: 'https://integrate.api.nvidia.com/v1',
  AI_MODEL: 'meta/llama-3.1-8b-instruct',
  REAL_UPLOADS_ENABLED: 'false',
  YOUTUBE_UPLOADS_ENABLED: 'false',
  INSTAGRAM_UPLOADS_ENABLED: 'false',
}

function isMissing(value) {
  return !value || value === 'REPLACE_ME' || value.trim() === ''
}

function upsertEnv(text, key, value) {
  const re = new RegExp(`^${key}=.*$`, 'm')
  if (re.test(text)) {
    const current = text.match(re)?.[0]?.split('=').slice(1).join('=') ?? ''
    if (!isMissing(current)) return { text, changed: false, reason: 'already set' }
    return { text: text.replace(re, `${key}=${value}`), changed: true }
  }
  return { text: `${text.trimEnd()}\n${key}=${value}\n`, changed: true }
}

let text = fs.readFileSync(envPath, 'utf8')
const log = []

if (!/^N8N_ENCRYPTION_KEY=.{32,}/m.test(text) || isMissing(text.match(/^N8N_ENCRYPTION_KEY=(.*)$/m)?.[1])) {
  const key = crypto.randomBytes(32).toString('hex')
  const r = upsertEnv(text, 'N8N_ENCRYPTION_KEY', key)
  text = r.text
  log.push('N8N_ENCRYPTION_KEY=generated (64-char hex)')
}

for (const [key, value] of Object.entries(defaults)) {
  const match = text.match(new RegExp(`^${key}=(.*)$`, 'm'))
  const current = match?.[1] ?? ''
  if (isMissing(current)) {
    const r = upsertEnv(text, key, value)
    text = r.text
    log.push(`${key}=${value}`)
  }
}

if (isMissing(text.match(/^AI_PROVIDER_API_KEY=(.*)$/m)?.[1])) {
  log.push('AI_PROVIDER_API_KEY=still MISSING — get nvapi- key from https://build.nvidia.com')
}

for (const key of [
  'GOOGLE_DRIVE_CLIENT_ID',
  'GOOGLE_DRIVE_CLIENT_SECRET',
  'GOOGLE_DRIVE_REFRESH_TOKEN',
  'GOOGLE_DRIVE_ROOT_FOLDER_ID',
  'GOOGLE_DRIVE_PROCESSED_FOLDER_ID',
  'GOOGLE_DRIVE_FAILED_FOLDER_ID',
]) {
  const current = text.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1] ?? ''
  if (isMissing(current)) {
    log.push(`${key}=still MISSING — see infra/google-drive/SETUP.md`)
  }
}

fs.writeFileSync(envPath, text)
console.log('Updated .env:')
for (const line of log) console.log(`  - ${line}`)
