/** Push n8n workflow JSON via REST. Import or update. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createN8nClient, listWorkflows, updateWorkflow } from './lib/n8n-api.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workflowsDir = path.join(path.resolve(__dirname, '..'), 'infra/n8n/workflows')

const client = createN8nClient()
const workflowFiles = fs.readdirSync(workflowsDir).filter((n) => n.endsWith('.json')).sort()

async function upsertWorkflow(fileName, existingByName) {
  const payload = JSON.parse(fs.readFileSync(path.join(workflowsDir, fileName), 'utf8'))
  const body = {
    name: payload.name,
    nodes: payload.nodes,
    connections: payload.connections,
    settings: payload.settings ?? {},
    staticData: payload.staticData ?? null,
  }

  const existing = existingByName.get(payload.name)
  if (existing) {
    await updateWorkflow(client, existing.id, body)
    return { id: existing.id, action: 'updated' }
  }

  const { ok, status, data } = await client.api('POST', '/workflows', body)
  if (!ok) throw new Error(`${fileName}: ${status} ${JSON.stringify(data)}`)
  return { id: data.id, action: 'created' }
}

console.log(`Importing ${workflowFiles.length} workflows to ${client.baseUrl} ...`)

const existing = await listWorkflows(client)
const existingByName = new Map(existing.map((w) => [w.name, w]))

for (const fileName of workflowFiles) {
  try {
    const result = await upsertWorkflow(fileName, existingByName)
    console.log(`  OK  ${fileName} → ${result.action} id=${result.id}`)
  } catch (err) {
    console.error(`  FAIL ${fileName}: ${err.message}`)
    process.exitCode = 1
  }
}

if (process.exitCode) process.exit(process.exitCode)
console.log('\nImport complete.')
