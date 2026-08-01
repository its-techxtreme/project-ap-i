import { ERROR_CODES } from '@project-api/shared'
import { afterEach, describe, expect, it } from 'vitest'

import {
  classifyDriveError,
  clearDriveAuthCircuit,
  getCachedDriveAuthProbe,
  isDriveAuthErrorMessage,
  markDriveAuthFailed,
} from '../src/storage/driveAuth'

describe('driveAuth', () => {
  afterEach(() => {
    clearDriveAuthCircuit()
  })

  it('detects invalid_grant as auth failure', () => {
    expect(isDriveAuthErrorMessage('invalid_grant')).toBe(true)
    expect(isDriveAuthErrorMessage('Token has been expired or revoked.')).toBe(true)
    expect(isDriveAuthErrorMessage('network timeout')).toBe(false)
  })

  it('classifies invalid_grant as non-retryable DRIVE_AUTH_FAILED', () => {
    const err = classifyDriveError(new Error('invalid_grant'), 'upload')
    expect(err.code).toBe(ERROR_CODES.DRIVE_AUTH_FAILED)
    expect(err.retryable).toBe(false)
    expect(getCachedDriveAuthProbe()?.ok).toBe(false)
  })

  it('classifies generic upload errors as retryable DRIVE_UPLOAD_FAILED', () => {
    const err = classifyDriveError(new Error('socket hang up'), 'upload')
    expect(err.code).toBe(ERROR_CODES.DRIVE_UPLOAD_FAILED)
    expect(err.retryable).toBe(true)
  })

  it('markDriveAuthFailed opens the circuit cache', () => {
    markDriveAuthFailed('invalid_grant')
    expect(getCachedDriveAuthProbe()).toMatchObject({ ok: false })
  })
})
