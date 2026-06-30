import { describe, expect, it } from 'vitest'

import { normalizeClaimRpcResult } from '../src/db/jobsRepo'

describe('normalizeClaimRpcResult', () => {
  it('returns null for SQL NULL composite (all-null object from Supabase)', () => {
    expect(normalizeClaimRpcResult({ id: null, status: null })).toBeNull()
  })

  it('returns null for missing data', () => {
    expect(normalizeClaimRpcResult(null)).toBeNull()
    expect(normalizeClaimRpcResult(undefined)).toBeNull()
  })

  it('returns job row when id is present', () => {
    const job = { id: 'job-123', status: 'locked' }
    expect(normalizeClaimRpcResult(job)).toEqual(job)
  })
})
