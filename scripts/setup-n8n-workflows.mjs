/**
 * Create n8n credentials and wire imported Phase 12 workflows.
 * Reads secrets from .env locally — does not print secret values.
 *
 * Usage: node scripts/setup-n8n-workflows.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createN8nClient, listWorkflows, updateWorkflow } from './lib/n8n-api.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const envPath = path.join(repoRoot, '.env')
const workflowsDir = path.join(repoRoot, 'infra/n8n/workflows')

function loadEnv() {
  const env = {}
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1)
  }
  return env
}

function requireEnv(env, key) {
  const value = env[key]
  if (!value || value === 'REPLACE_ME' || value.trim() === '') {
    throw new Error(`Missing ${key} in .env`)
  }
  return value
}

const env = loadEnv()
const client = createN8nClient(env)
const workerToken = requireEnv(env, 'WORKER_INTERNAL_TOKEN')
const webhookToken = env.N8N_WEBHOOK_TOKEN
if (!webhookToken || webhookToken === 'REPLACE_ME') {
  console.warn('N8N_WEBHOOK_TOKEN missing — WebhookInternalToken credential will be skipped')
}

async function findOrCreateCredential(name, type, data) {
  const { ok, status, data: listData } = await client.api('GET', '/credentials')
  if (!ok) throw new Error(`GET /credentials → ${status}`)
  const existing = (listData.data ?? listData).find((c) => c.name === name)
  if (existing) {
    console.log(`  credential exists: ${name} (${existing.id})`)
    return existing.id
  }
  const { ok: createOk, status: createStatus, data: created } = await client.api('POST', '/credentials', {
    name,
    type,
    data,
  })
  if (!createOk) throw new Error(`POST /credentials → ${createStatus}`)
  console.log(`  credential created: ${name} (${created.id})`)
  return created.id
}

async function listAllWorkflows() {
  return listWorkflows(client)
}

function setExecuteWorkflowTarget(nodes, nodeName, targetWorkflowId, targetWorkflowName) {
  return nodes.map((node) => {
    if (node.name !== nodeName) return node
    return {
      ...node,
      parameters: {
        ...node.parameters,
        workflowId: {
          __rl: true,
          mode: 'list',
          value: targetWorkflowId,
          cachedResultName: targetWorkflowName,
        },
      },
    }
  })
}

function attachCredential(nodes, credentialKey, credentialId, credentialName) {
  return nodes.map((node) => {
    const cred = node.credentials?.[credentialKey]
    if (!cred || cred.name !== credentialName) return node
    return {
      ...node,
      credentials: {
        ...node.credentials,
        [credentialKey]: { id: credentialId, name: credentialName },
      },
    }
  })
}

async function main() {
  console.log(`Connecting to n8n at ${client.baseUrl}`)

  const workerCredId = await findOrCreateCredential('WorkerToken', 'httpHeaderAuth', {
    name: 'X-Worker-Token',
    value: workerToken,
  })

  let webhookCredId = null
  if (webhookToken && webhookToken !== 'REPLACE_ME') {
    webhookCredId = await findOrCreateCredential('WebhookInternalToken', 'httpHeaderAuth', {
      name: 'X-Webhook-Token',
      value: webhookToken,
    })
  }

  const workflows = await listAllWorkflows()
  const byName = Object.fromEntries(workflows.map((w) => [w.name, w]))

  const wf02 = byName['WF-02 Process Job']
  const wf03 = byName['WF-03 Upload Verification']
  if (!wf02 || !wf03) {
    throw new Error('WF-02 or WF-03 not found — run import-n8n-workflows.mjs first')
  }

  for (const wf of workflows) {
    const fileName = Object.entries({
      'WF-01 New Job Poller': 'WF-01_new_job_poller.json',
      'WF-02 Process Job': 'WF-02_process_job.json',
      'WF-03 Upload Verification': 'WF-03_upload_verification.json',
      'WF-04 Manual Retry Webhook': 'WF-04_manual_retry_webhook.json',
      'WF-05 Drive Cleanup Webhook': 'WF-05_drive_cleanup_webhook.json',
      'WF-06 Account Health Check': 'WF-06_account_health_check.json',
    }).find(([name]) => name === wf.name)?.[1]

    if (!fileName) continue

    let nodes = JSON.parse(fs.readFileSync(path.join(workflowsDir, fileName), 'utf8')).nodes
    nodes = attachCredential(nodes, 'httpHeaderAuth', workerCredId, 'WorkerToken')
    if (webhookCredId) {
      nodes = attachCredential(nodes, 'httpHeaderAuth', webhookCredId, 'WebhookInternalToken')
    }

    if (wf.name === 'WF-01 New Job Poller') {
      nodes = setExecuteWorkflowTarget(nodes, 'Run WF-02 Process Job', wf02.id, wf02.name)
    }
    if (wf.name === 'WF-02 Process Job') {
      nodes = setExecuteWorkflowTarget(nodes, 'Run WF-03 Verify', wf03.id, wf03.name)
    }

    const settings = {
      ...(wf.settings ?? {}),
      executionOrder: 'v1',
      callerPolicy: 'workflowsFromSameOwner',
      availableInMCP: true,
    }

    await updateWorkflow(client, wf.id, {
      name: wf.name,
      nodes,
      connections: JSON.parse(fs.readFileSync(path.join(workflowsDir, fileName), 'utf8')).connections,
      settings,
      staticData: wf.staticData ?? null,
    })

    console.log(`  wired workflow: ${wf.name} (${wf.id})`)
  }

  console.log('\nSetup complete.')
  console.log('Next: node scripts/test-n8n-workflows.mjs')
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
