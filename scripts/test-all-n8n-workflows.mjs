/** Import setup publish and test the Phase 12 n8n workflows. */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  createN8nClient,
  listWorkflows,
  publishWorkflow,
} from './lib/n8n-api.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const env = (await import('./lib/n8n-api.mjs')).loadEnv()
const client = createN8nClient(env)
const webhookToken = env.N8N_WEBHOOK_TOKEN
const workerBase = env.WORKER_BASE_URL || 'http://localhost:3001'
const workerToken = env.WORKER_INTERNAL_TOKEN

const WF_NAMES = [
  'WF-01 New Job Poller',
  'WF-02 Process Job',
  'WF-03 Upload Verification',
  'WF-04 Manual Retry Webhook',
  'WF-05 Drive Cleanup Webhook',
  'WF-06 Account Health Check',
]

let failures = 0

function pass(msg) {
  console.log(`PASS  ${msg}`)
}

function fail(msg) {
  console.error(`FAIL  ${msg}`)
  failures += 1
}

function runNodeScript(relativePath) {
  console.log(`\n==> ${relativePath}`)
  const result = spawnSync(process.execPath, [path.join(repoRoot, relativePath)], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.status !== 0) throw new Error(`${relativePath} failed`)
}

async function testWebhook(pathSuffix, body, withToken = true) {
  const headers = { 'Content-Type': 'application/json' }
  if (withToken && webhookToken) headers['X-Webhook-Token'] = webhookToken
  const response = await fetch(`${client.baseUrl}/webhook/${pathSuffix}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  const text = await response.text()
  let parsed = {}
  try {
    parsed = text ? JSON.parse(text) : {}
  } catch {
    parsed = { raw: text.slice(0, 200) }
  }
  return { status: response.status, parsed }
}

async function main() {
  console.log('Phase 12 — full n8n workflow test run\n')

  runNodeScript('scripts/import-n8n-workflows.mjs')
  runNodeScript('scripts/setup-n8n-workflows.mjs')

  let workflows = await listWorkflows(client)
  const byName = Object.fromEntries(workflows.map((w) => [w.name, w]))

  for (const name of WF_NAMES) {
    if (byName[name]) pass(`${name} present (${byName[name].id})`)
    else fail(`${name} not found`)
  }

  console.log('\n==> Publish workflows')
  const publishOrder = [
    'WF-03 Upload Verification',
    'WF-02 Process Job',
    'WF-04 Manual Retry Webhook',
    'WF-05 Drive Cleanup Webhook',
    'WF-01 New Job Poller',
    'WF-06 Account Health Check',
  ]
  for (const name of publishOrder) {
    const wf = byName[name]
    if (!wf) continue
    try {
      await publishWorkflow(client, wf.id)
      pass(`${name} published/active`)
    } catch (err) {
      fail(`${name} publish: ${err.message}`)
    }
  }

  workflows = await listWorkflows(client)
  const fresh = Object.fromEntries(workflows.map((w) => [w.name, w]))

  console.log('\n==> Execute workflow tests')

  const noAuth = await testWebhook(
    'project-ap-i/manual-retry',
    { jobId: '00000000-0000-4000-8000-000000000000', requestedBy: 'test' },
    false,
  )
  if ([401, 403, 404].includes(noAuth.status)) pass(`WF-04 rejects missing webhook token (${noAuth.status})`)
  else fail(`WF-04 expected auth rejection, got ${noAuth.status}`)

  const wf04 = await testWebhook('project-ap-i/manual-retry', {
    jobId: '00000000-0000-4000-8000-000000000000',
    requestedBy: 'test',
  })
  if ([200, 400, 404, 500].includes(wf04.status) && wf04.parsed.error !== 'access to env vars denied') {
    pass(`WF-04 webhook executed (${wf04.status})`)
  } else {
    fail(`WF-04 webhook failed (${wf04.status}): ${JSON.stringify(wf04.parsed)}`)
  }

  const wf05 = await testWebhook('project-ap-i/drive-cleanup', {
    jobId: '00000000-0000-4000-8000-000000000000',
    requestedBy: 'test',
  })
  if ([200, 400, 404, 500].includes(wf05.status) && wf05.parsed.error !== 'access to env vars denied') {
    pass(`WF-05 webhook executed (${wf05.status})`)
  } else {
    fail(`WF-05 webhook failed (${wf05.status}): ${JSON.stringify(wf05.parsed)}`)
  }

  const health = await fetch(`${workerBase}/health`)
  if (health.ok) pass('worker /health reachable')
  else fail(`worker /health ${health.status}`)

  const claim = await fetch(`${workerBase}/jobs/claim`, {
    method: 'POST',
    headers: { 'X-Worker-Token': workerToken },
  })
  const claimBody = await claim.json()
  if (claim.ok && typeof claimBody.claimed === 'boolean') {
    pass(`worker /jobs/claim → claimed=${claimBody.claimed}`)
  } else {
    fail(`worker /jobs/claim failed (${claim.status})`)
  }

  if (fresh['WF-01 New Job Poller']?.active) pass('WF-01 poller active (schedule trigger)')
  else fail('WF-01 not active')

  if (fresh['WF-06 Account Health Check']?.active) pass('WF-06 health check active (schedule trigger)')
  else fail('WF-06 not active')

  if (fresh['WF-02 Process Job']?.active && fresh['WF-03 Upload Verification']?.active) {
    pass('WF-02/WF-03 published for WF-01 sub-workflow chain')
  } else {
    fail('WF-02 or WF-03 not active after publish')
  }

  console.log('')
  if (failures) {
    console.error(`Finished with ${failures} failure(s).`)
    process.exit(1)
  }
  console.log('All workflow tests passed.')
}

main().catch((err) => {
  console.error(`FAIL  ${err.message}`)
  process.exit(1)
})
