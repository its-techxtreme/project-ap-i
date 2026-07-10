import { describe, expect, it } from 'vitest'

import { buildServer } from '../src/server'
import { config } from '../src/config'

describe('worker security checklist', () => {
  it('health endpoint does not return service role key', async () => {
    const app = await buildServer()
    const response = await app.inject({ method: 'GET', url: '/health' })
    const body = JSON.stringify(response.json())

    expect(response.statusCode).toBe(200)
    expect(body).not.toMatch(/service.?role/i)
    expect(body).not.toContain(process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'MISSING')
  })

  it('health endpoint does not return worker token', async () => {
    const app = await buildServer()
    const response = await app.inject({ method: 'GET', url: '/health' })
    const body = JSON.stringify(response.json())

    expect(body).not.toContain(process.env.WORKER_INTERNAL_TOKEN ?? 'MISSING')
  })

  it('claim endpoint requires valid worker token', async () => {
    const app = await buildServer()
    const response = await app.inject({ method: 'POST', url: '/jobs/claim' })
    expect(response.statusCode).toBe(401)
  })

  it('REAL_UPLOADS_ENABLED is false in test environment', () => {
    expect(config.REAL_UPLOADS_ENABLED).toBe(false)
  })

  it('health checks object does not embed worker token', async () => {
    const app = await buildServer()
    const response = await app.inject({ method: 'GET', url: '/health' })
    const json = response.json() as { checks: Record<string, unknown> }
    expect(JSON.stringify(json.checks)).not.toContain(process.env.WORKER_INTERNAL_TOKEN ?? 'MISSING')
  })
})
