import { describe, expect, it } from 'vitest'

import { normalizeAdminCommandClaim } from '../src/db/adminCommandsRepo'

describe('normalizeAdminCommandClaim', () => {
  it('treats all-null composite as empty', () => {
    expect(normalizeAdminCommandClaim({ id: null, command: null })).toBeNull()
    expect(normalizeAdminCommandClaim(null)).toBeNull()
  })

  it('returns row when id is present', () => {
    expect(
      normalizeAdminCommandClaim({
        id: 'cmd-1',
        job_id: 'job-1',
        command: 'retry_upload',
      }),
    ).toMatchObject({ id: 'cmd-1', job_id: 'job-1' })
  })
})
