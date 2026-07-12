import { describe, expect, it } from 'vitest'

import { platformsNeedingUpload } from '../src/jobs/uploadFinalize'
import { isTransientUploadFailure } from '../src/uploaders/transientUploadErrors'

describe('platformsNeedingUpload', () => {
  it('never re-uploads platforms that already succeeded', () => {
    expect(platformsNeedingUpload('uploaded', 'failed')).toEqual(['instagram'])
    expect(platformsNeedingUpload('failed', 'verified')).toEqual(['youtube'])
    expect(platformsNeedingUpload('uploaded', 'uploaded')).toEqual([])
  })

  it('does not force explicit platform override when already uploaded', () => {
    expect(platformsNeedingUpload('uploaded', 'pending', 'youtube')).toEqual([])
    expect(platformsNeedingUpload('pending', 'uploaded', 'instagram')).toEqual([])
    expect(platformsNeedingUpload('failed', 'uploaded', 'youtube')).toEqual(['youtube'])
  })
})

describe('isTransientUploadFailure', () => {
  it('does not treat publish-without-URL as transient (prevents YT duplicate loop)', () => {
    expect(
      isTransientUploadFailure({
        success: false,
        errorMessage: 'YouTube publish clicked but no video URL was captured — refusing synthetic media id',
      }),
    ).toBe(false)
  })

  it('still treats profile-busy as transient', () => {
    expect(
      isTransientUploadFailure({
        success: false,
        errorCode: 'PROFILE_BUSY',
        errorMessage: 'profile is already in use',
      }),
    ).toBe(true)
  })
})
