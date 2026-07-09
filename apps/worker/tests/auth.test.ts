import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildServer } from '../src/server'
import { timingSafeEqual, validateWorkerToken } from '../src/security/validateWorkerToken'

const VALID_TOKEN = 'test-worker-internal-token-min-32-chars'

describe('worker auth middleware', () => {
  let app: Awaited<ReturnType<typeof buildServer>>

  beforeEach(async () => {
    app = await buildServer()
  })

  it('POST /jobs/claim without token returns 401', async () => {
    const response = await app.inject({ method: 'POST', url: '/jobs/claim' })
    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: 'Authentication required.' })
  })

  it('POST /jobs/claim with wrong token returns 403', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/jobs/claim',
      headers: { 'x-worker-token': 'wrong-token-value-that-is-long-enough' },
    })
    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({ error: 'Forbidden.' })
  })

  it('POST /jobs/claim with correct token returns 200', async () => {
    const rpcMock = vi.fn().mockResolvedValue({ data: null, error: null })
    vi.doMock('../src/db/supabaseAdmin', () => ({
      supabaseAdmin: { rpc: rpcMock },
    }))

    const { buildServer: buildFreshServer } = await import('../src/server')
    const freshApp = await buildFreshServer()

    const response = await freshApp.inject({
      method: 'POST',
      url: '/jobs/claim',
      headers: { 'x-worker-token': VALID_TOKEN },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ claimed: false, job: null })
  })

  it('GET /health does not require token', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' })
    expect(response.statusCode).toBe(200)
  })

  it('protected job routes require valid token', async () => {
    const routes = [
      { method: 'POST' as const, url: '/jobs/claim' },
      { method: 'POST' as const, url: '/jobs/abc/process' },
      { method: 'POST' as const, url: '/jobs/abc/upload' },
      { method: 'POST' as const, url: '/jobs/abc/verify' },
      { method: 'POST' as const, url: '/admin-commands/process-next' },
    ]

    for (const route of routes) {
      const response = await app.inject(route)
      expect(response.statusCode).toBe(401)
    }
  })

  it('uses timing-safe token comparison', () => {
    const expected = Buffer.from(VALID_TOKEN)
    const almost = Buffer.from(`${VALID_TOKEN}x`)

    expect(timingSafeEqual(expected, almost)).toBe(false)
    expect(validateWorkerToken(`${VALID_TOKEN}x`, VALID_TOKEN)).toBe(false)
    expect(validateWorkerToken(VALID_TOKEN, VALID_TOKEN)).toBe(true)
  })
})
