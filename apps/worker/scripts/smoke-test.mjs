/**
 * Live smoke test against a running worker + Supabase.
 * Usage (from repo root): node --env-file=.env apps/worker/scripts/smoke-test.mjs [baseUrl]
 */

const baseUrl = process.argv[2] ?? process.env.WORKER_BASE_URL ?? 'http://localhost:3001'
const token = process.env.WORKER_INTERNAL_TOKEN

if (!token || token.length < 32) {
  console.error('FAIL: WORKER_INTERNAL_TOKEN missing or too short in .env')
  process.exit(1)
}

async function request(method, urlPath, body) {
  const headers = { 'x-worker-token': token }
  const init = { method, headers }
  if (body !== undefined) {
    headers['content-type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  const res = await fetch(`${baseUrl}${urlPath}`, init)
  const json = await res.json().catch(() => ({}))
  return { status: res.status, body: json }
}

let failed = false
function pass(msg) {
  console.log(`PASS: ${msg}`)
}
function fail(msg, detail) {
  failed = true
  console.error(`FAIL: ${msg}`, detail ?? '')
}

console.log(`Smoke testing worker at ${baseUrl}`)

const health = await request('GET', '/health')
if (health.status === 200 && health.body.ok === true) {
  pass('GET /health returns ok')
} else {
  fail('GET /health', health)
}

if (health.body.realUploadsEnabled === false) {
  pass('realUploadsEnabled is false')
} else {
  fail('realUploadsEnabled should be false', health.body)
}

const bodyStr = JSON.stringify(health.body)
if (bodyStr.toLowerCase().includes('service_role') || bodyStr.includes(token)) {
  fail('health response leaks secrets')
} else {
  pass('health response has no secrets')
}

const noAuth = await fetch(`${baseUrl}/jobs/claim`, { method: 'POST' })
if (noAuth.status === 401) {
  pass('POST /jobs/claim without token returns 401')
} else {
  fail('missing token should return 401', { status: noAuth.status })
}

const badRes = await fetch(`${baseUrl}/jobs/claim`, {
  method: 'POST',
  headers: { 'x-worker-token': 'wrong-token-that-is-still-long-enough-xx' },
})
if (badRes.status === 403) {
  pass('POST /jobs/claim with wrong token returns 403')
} else {
  fail('wrong token should return 403', { status: badRes.status })
}

const claim = await request('POST', '/jobs/claim')
if (claim.status === 200) {
  pass('POST /jobs/claim with valid token returns 200')
} else {
  fail('valid claim request failed', claim)
}

if (claim.body.claimed === false) {
  pass('claim returned empty queue (claimed: false)')
} else if (claim.body.claimed === true && claim.body.job?.id) {
  pass(`claimed job ${claim.body.job.id}`)
  const jobId = claim.body.job.id

  for (const step of ['process', 'upload', 'verify']) {
    const stepRes = await request('POST', `/jobs/${jobId}/${step}`)
    if (stepRes.status === 200 && stepRes.body.success === true) {
      pass(`POST /jobs/:id/${step} succeeded (${stepRes.body.finalStatus})`)
    } else {
      fail(`POST /jobs/:id/${step}`, stepRes)
    }
  }
} else if (claim.body.claimed === true && !claim.body.job?.id) {
  fail('claim returned claimed:true without a job id', claim.body)
} else {
  fail('unexpected claim response shape', claim.body)
}

if (failed) {
  console.error('\nSmoke test FAILED')
  process.exit(1)
}

console.log('\nSmoke test PASSED')
