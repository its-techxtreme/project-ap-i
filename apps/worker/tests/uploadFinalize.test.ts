import { describe, expect, it, vi } from 'vitest'

import { ERROR_CODES } from '@project-api/shared'

const updateMock = vi.fn()

vi.mock('../src/db/jobsRepo', () => ({
  updateJobStatus: (...args: unknown[]) => updateMock(...args),
}))

vi.mock('../src/config', () => ({
  config: { VERIFY_DELAY_MINUTES: 5 },
}))

import { finalizeUploadStatus, platformsNeedingUpload } from '../src/jobs/uploadFinalize'

describe('uploadFinalize', () => {
  it('both uploaded -> awaiting_verification', async () => {
    updateMock.mockReset()
    const status = await finalizeUploadStatus('job-1', 'uploaded', 'uploaded')
    expect(status).toBe('awaiting_verification')
    expect(updateMock).toHaveBeenCalledWith(
      'job-1',
      'awaiting_verification',
      expect.objectContaining({ verification_due_at: expect.any(String) }),
    )
  })

  it('partial success -> awaiting_verification for verify retry window', async () => {
    updateMock.mockReset()
    const status = await finalizeUploadStatus('job-2', 'failed', 'uploaded')
    expect(status).toBe('awaiting_verification')
  })

  it('total failure parks in awaiting_verification for automated retry', async () => {
    updateMock.mockReset()
    const status = await finalizeUploadStatus('job-4', 'failed', 'failed')
    expect(status).toBe('awaiting_verification')
    expect(updateMock).toHaveBeenCalledWith(
      'job-4',
      'awaiting_verification',
      expect.objectContaining({
        failure_reason: 'One or more platform uploads failed',
        verification_due_at: expect.any(String),
      }),
    )
  })

  it('login required uses platform-specific failure code', async () => {
    updateMock.mockReset()
    const status = await finalizeUploadStatus('job-3', 'uploaded', 'login_required')
    expect(status).toBe('needs_manual_review')
    expect(updateMock).toHaveBeenCalledWith(
      'job-3',
      'needs_manual_review',
      expect.objectContaining({ failure_code: ERROR_CODES.INSTAGRAM_LOGIN_REQUIRED }),
    )
  })

  it('platformsNeedingUpload targets only failed platform on retry', () => {
    expect(platformsNeedingUpload('failed', 'uploaded', 'youtube')).toEqual(['youtube'])
    expect(platformsNeedingUpload('uploaded', 'failed', 'instagram')).toEqual(['instagram'])
  })

  it('platformsNeedingUpload auto-detects failed platforms when unspecified', () => {
    expect(platformsNeedingUpload('failed', 'uploaded')).toEqual(['youtube'])
    expect(platformsNeedingUpload('uploaded', 'failed')).toEqual(['instagram'])
  })

  it('platformsNeedingUpload returns empty when both platforms already succeeded', () => {
    expect(platformsNeedingUpload('uploaded', 'uploaded')).toEqual([])
    expect(platformsNeedingUpload('verified', 'verified')).toEqual([])
  })

  it('platformsNeedingUpload includes login_required for post-recovery retry', () => {
    expect(platformsNeedingUpload('login_required', 'uploaded')).toEqual(['youtube'])
    expect(platformsNeedingUpload('uploaded', 'login_required')).toEqual(['instagram'])
  })
})
