import { describe, expect, it } from 'vitest'

import { buildServer } from '../src/server'

describe('GET /health', () => {
  it('returns ok without auth token', async () => {
    const app = await buildServer()
    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ ok: true })
  })

  it('includes realUploadsEnabled false', async () => {
    const app = await buildServer()
    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.json().realUploadsEnabled).toBe(false)
  })

  it('does not expose secrets in the response body', async () => {
    const app = await buildServer()
    const body = JSON.stringify(await app.inject({ method: 'GET', url: '/health' }).then((r) => r.json()))

    expect(body).not.toContain('test-service-role-key')
    expect(body).not.toContain('test-worker-internal-token')
    expect(body).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(body).not.toContain('supabase.co')
  })
})
