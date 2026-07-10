import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.resolve(__dirname, '../../.env')

export function loadEnv() {
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

export function createN8nClient(env = loadEnv()) {
  const apiKey = env.N8N_API_KEY
  if (!apiKey || apiKey === 'REPLACE_ME') {
    throw new Error('Missing N8N_API_KEY in .env')
  }

  const baseUrl = (env.N8N_API_BASE_URL || env.WEBHOOK_URL || 'http://localhost:5678/').replace(/\/$/, '')

  async function api(method, route, body) {
    const response = await fetch(`${baseUrl}/api/v1${route}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-N8N-API-KEY': apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await response.text()
    const data = text ? JSON.parse(text) : {}
    return { ok: response.ok, status: response.status, data }
  }

  return { baseUrl, api, apiKey }
}

export async function listWorkflows(client) {
  const { data } = await client.api('GET', '/workflows?limit=250')
  return data.data ?? data
}

export async function getWorkflow(client, id) {
  const { ok, status, data } = await client.api('GET', `/workflows/${id}`)
  if (!ok) throw new Error(`GET /workflows/${id} → ${status}: ${JSON.stringify(data)}`)
  return data
}

export async function deactivateWorkflow(client, id) {
  const attempts = [
    ['POST', `/workflows/${id}/deactivate`],
    ['POST', `/workflows/${id}/unpublish`],
  ]
  for (const [method, route] of attempts) {
    const { ok } = await client.api(method, route)
    if (ok) return true
  }

  const wf = await getWorkflow(client, id)
  const { ok } = await client.api('PUT', `/workflows/${id}`, {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings ?? {},
    staticData: wf.staticData ?? null,
    active: false,
  })
  return ok
}

export async function updateWorkflow(client, id, payload) {
  if (payload.active !== false) {
    await deactivateWorkflow(client, id)
  }
  const { ok, status, data } = await client.api('PUT', `/workflows/${id}`, payload)
  if (!ok) throw new Error(`PUT /workflows/${id} → ${status}: ${JSON.stringify(data)}`)
  return data
}

export async function publishWorkflow(client, id) {
  const attempts = [
    ['POST', `/workflows/${id}/activate`],
    ['POST', `/workflows/${id}/publish`],
  ]

  for (const [method, route] of attempts) {
    const { ok, data } = await client.api(method, route)
    // n8n 2.x activate returns the workflow object with active:true
    if (ok) {
      if (data.active === true || data.activeVersionId || data.success === true || data.id) {
        return data
      }
    }
  }

  const fresh = await getWorkflow(client, id)
  if (fresh.active) return fresh
  throw new Error(`publish ${id} failed — activate/publish endpoints rejected and workflow still inactive`)
}

export async function runWorkflowTest(client, workflowId, pinData) {
  const { ok, status, data } = await client.api('POST', `/workflows/${workflowId}/run`, {
    runData: pinData ? { pinData } : undefined,
  })
  if (ok) return data

  const testRes = await client.api('POST', `/workflows/${workflowId}/test`, { pinData: pinData ?? {} })
  if (testRes.ok) return testRes.data

  throw new Error(`test ${workflowId} failed → run:${status}, test:${testRes.status}`)
}

export async function waitForExecution(client, executionId, timeoutMs = 45000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const { ok, data } = await client.api('GET', `/executions/${executionId}?includeData=true`)
    if (!ok) throw new Error(`GET execution ${executionId} failed`)
    const status = data.status ?? data.data?.status
    if (['success', 'error', 'crashed', 'canceled'].includes(status)) return data
    await new Promise((r) => setTimeout(r, 1500))
  }
  throw new Error(`Execution ${executionId} timed out`)
}
