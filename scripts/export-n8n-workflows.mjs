/**
 * Export live n8n workflows into portable, credential-free JSON files.
 *
 * Writes to infra/n8n/workflows/. Strips credential IDs, instance workflow IDs,
 * pinData, and other host-specific fields. Keeps credential *names* and
 * cachedResultName so `pnpm n8n:setup` can re-wire a fresh instance.
 *
 * Usage: node --env-file=.env scripts/export-n8n-workflows.mjs
 *    or: pnpm n8n:export
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createN8nClient, getWorkflow, listWorkflows } from './lib/n8n-api.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workflowsDir = path.join(path.resolve(__dirname, '..'), 'infra/n8n/workflows')

const NAME_TO_FILE = {
  'WF-01 New Job Poller': 'WF-01_new_job_poller.json',
  'WF-02 Process Job': 'WF-02_process_job.json',
  'WF-03 Upload Verification': 'WF-03_upload_verification.json',
  'WF-04 Manual Retry Webhook': 'WF-04_manual_retry_webhook.json',
  'WF-05 Drive Cleanup Webhook': 'WF-05_drive_cleanup_webhook.json',
  'WF-06 Account Health Check': 'WF-06_account_health_check.json',
  'WF-07 Admin Command Poller': 'WF-07_admin_command_poller.json',
  'WF-08 Verification Cron': 'WF-08_verification_cron.json',
}

// Catch hardcoded secrets, not env expressions like {{ $env.SUPABASE_SERVICE_ROLE_KEY }}.
const SECRETISH =
  /(sk-[A-Za-z0-9]{20,}|nvapi-[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9._-]{10,}|sb_secret_[A-Za-z0-9_]+|Bearer\s+(?!\{\{)[A-Za-z0-9._-]{24,})/i

function sanitizeCredentials(credentials) {
  if (!credentials || typeof credentials !== 'object') return credentials
  const out = {}
  for (const [type, value] of Object.entries(credentials)) {
    if (!value || typeof value !== 'object') continue
    if (typeof value.name === 'string' && value.name.trim()) {
      out[type] = { name: value.name }
    }
  }
  return Object.keys(out).length ? out : undefined
}

function sanitizeWorkflowIdParam(workflowId) {
  if (!workflowId || typeof workflowId !== 'object') return workflowId
  return {
    ...workflowId,
    // Instance-specific IDs are useless on a fresh n8n — keep the display name only.
    value: '',
    mode: workflowId.mode ?? 'list',
    __rl: true,
  }
}

function sanitizeNode(node) {
  const parameters = { ...(node.parameters ?? {}) }
  if (parameters.workflowId) {
    parameters.workflowId = sanitizeWorkflowIdParam(parameters.workflowId)
  }

  const cleaned = {
    parameters,
    id: node.id,
    name: node.name,
    type: node.type,
    typeVersion: node.typeVersion,
    position: node.position,
  }

  if (node.onError) cleaned.onError = node.onError
  if (node.webhookId) cleaned.webhookId = node.webhookId
  if (node.notes) cleaned.notes = node.notes
  if (node.notesInFlow != null) cleaned.notesInFlow = node.notesInFlow
  if (node.disabled != null) cleaned.disabled = node.disabled

  const credentials = sanitizeCredentials(node.credentials)
  if (credentials) cleaned.credentials = credentials

  return cleaned
}

function assertNoSecrets(label, value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (SECRETISH.test(text)) {
    throw new Error(`Refusing to write ${label}: looks like a hardcoded secret`)
  }
}

function toPortableExport(wf) {
  const payload = {
    name: wf.name,
    nodes: (wf.nodes ?? []).map(sanitizeNode),
    connections: wf.connections ?? {},
    settings: {
      executionOrder: wf.settings?.executionOrder ?? 'v1',
      callerPolicy: wf.settings?.callerPolicy ?? 'workflowsFromSameOwner',
    },
    staticData: null,
  }

  assertNoSecrets(wf.name, payload)
  return payload
}

const client = createN8nClient()
fs.mkdirSync(workflowsDir, { recursive: true })

console.log(`Exporting portable workflows from ${client.baseUrl} → ${workflowsDir}`)

const listed = await listWorkflows(client)
const byName = new Map(listed.map((w) => [w.name, w]))
let wrote = 0

for (const [name, fileName] of Object.entries(NAME_TO_FILE)) {
  const summary = byName.get(name)
  if (!summary) {
    console.warn(`  SKIP  ${fileName} — not found in n8n (${name})`)
    continue
  }

  const full = await getWorkflow(client, summary.id)
  const portable = toPortableExport(full)
  const outPath = path.join(workflowsDir, fileName)
  fs.writeFileSync(outPath, `${JSON.stringify(portable, null, 2)}\n`, 'utf8')
  console.log(`  OK    ${fileName} ← ${name}`)
  wrote += 1
}

if (!wrote) {
  console.error('No workflows exported.')
  process.exit(1)
}

console.log(`\nExported ${wrote} credential-free workflow JSON file(s).`)
console.log('Importers should create Header Auth credentials named WorkerToken / WebhookInternalToken,')
console.log('then run: pnpm n8n:import && pnpm n8n:setup')
