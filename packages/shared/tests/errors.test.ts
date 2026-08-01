import { describe, expect, it } from 'vitest'
import { ERROR_CODES, ProjectApiError } from '../src/errors'

describe('ProjectApiError', () => {
  it('can be thrown and caught with typed error codes', () => {
    expect(() => {
      throw new ProjectApiError(ERROR_CODES.INVALID_URL, 'Bad URL', { retryable: false, stage: 'validation' })
    }).toThrow(ProjectApiError)

    try {
      throw new ProjectApiError(ERROR_CODES.DOWNLOAD_FAILED, 'Download failed', { retryable: true, stage: 'download' })
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectApiError)
      if (error instanceof ProjectApiError) {
        expect(error.code).toBe('DOWNLOAD_FAILED')
        expect(error.message).toBe('Download failed')
        expect(error.retryable).toBe(true)
        expect(error.stage).toBe('download')
      }
    }
  })

  it('defaults retryable to false', () => {
    const error = new ProjectApiError(ERROR_CODES.UNAUTHORIZED, 'Unauthorized')
    expect(error.retryable).toBe(false)
    expect(error.stage).toBeUndefined()
  })
})

describe('ERROR_CODES', () => {
  it('includes pipeline error codes used across worker and web', () => {
    expect(ERROR_CODES.INVALID_URL).toBe('INVALID_URL')
    expect(ERROR_CODES.NICHE_ACCOUNT_MAPPING_INVALID).toBe('NICHE_ACCOUNT_MAPPING_INVALID')
    expect(ERROR_CODES.YOUTUBE_LOGIN_REQUIRED).toBe('YOUTUBE_LOGIN_REQUIRED')
    expect(ERROR_CODES.DRIVE_AUTH_FAILED).toBe('DRIVE_AUTH_FAILED')
  })
})
