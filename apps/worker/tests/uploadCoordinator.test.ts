import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ERROR_CODES } from '@project-api/shared'

const updateJobStatusMock = vi.fn()
const writeJobEventMock = vi.fn()
const eqMock = vi.fn()
const updateMock = vi.fn()
const insertMock = vi.fn()
const selectMock = vi.fn()
const singleMock = vi.fn()
const fromMock = vi.fn()

const uploadMock = vi.fn()
const resolveAccountsMock = vi.fn()

vi.mock('../src/db/jobsRepo', () => ({
  updateJobStatus: (...args: unknown[]) => updateJobStatusMock(...args),
  writeJobEvent: (...args: unknown[]) => writeJobEventMock(...args),
}))

vi.mock('../src/db/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}))

vi.mock('../src/uploaders/accountResolver', () => ({
  resolveNicheAccounts: (...args: unknown[]) => resolveAccountsMock(...args),
}))

const JOB_ID = 'job-upload-1'
const NICHE_ID = '11111111-1111-4111-8111-111111111111'
const YT_ACCT = 'yt-acct-1'
const IG_ACCT = 'ig-acct-1'

const baseJob = {
  id: JOB_ID,
  nicheId: NICHE_ID,
  nicheSlug: 'memes',
  driveFileId: 'drive-123',
  driveViewUrl: 'https://drive.google.com/file/d/drive-123',
  youtubeTitle: 'Test title',
  youtubeDescription: 'Test description',
  instagramCaption: 'Test caption',
  youtubeRetryCount: 0,
  instagramRetryCount: 0,
}

function setupSuccessfulDbMocks() {
  let attemptCounter = 0

  eqMock.mockReturnValue({ error: null })
  updateMock.mockReturnValue({ eq: eqMock })
  singleMock.mockImplementation(() => {
    attemptCounter += 1
    return Promise.resolve({ data: { id: `attempt-${attemptCounter}` }, error: null })
  })
  selectMock.mockReturnValue({ single: singleMock })
  insertMock.mockReturnValue({ select: selectMock })

  fromMock.mockImplementation((table: string) => {
    if (table === 'jobs') return { update: updateMock }
    if (table === 'upload_attempts') return { insert: insertMock, update: updateMock }
    if (table === 'platform_accounts') return { update: updateMock }
    throw new Error(`Unexpected table: ${table}`)
  })
}

describe('UploadCoordinator', () => {
  beforeEach(() => {
    updateJobStatusMock.mockReset()
    writeJobEventMock.mockReset()
    eqMock.mockReset()
    updateMock.mockReset()
    insertMock.mockReset()
    selectMock.mockReset()
    singleMock.mockReset()
    fromMock.mockReset()
    uploadMock.mockReset()
    resolveAccountsMock.mockReset()

    resolveAccountsMock.mockResolvedValue({
      youtube: { id: YT_ACCT, accountLabel: 'Memes YT' },
      instagram: { id: IG_ACCT, accountLabel: 'Memes IG' },
    })
    uploadMock.mockResolvedValue({
      success: true,
      platformMediaId: 'mock-media-id',
      platformUrl: 'https://example.com/post',
    })
    setupSuccessfulDbMocks()
  })

  it('uploads to both platforms for every job', async () => {
    const { UploadCoordinator } = await import('../src/uploaders/UploadCoordinator')
    const youtube = { upload: uploadMock, checkSession: vi.fn() }
    const instagram = { upload: uploadMock, checkSession: vi.fn() }
    const coordinator = new UploadCoordinator(youtube, instagram)

    await coordinator.uploadBothPlatforms(baseJob)

    expect(uploadMock).toHaveBeenCalledTimes(2)
    expect(uploadMock.mock.calls[0][0].platform).toBe('youtube')
    expect(uploadMock.mock.calls[1][0].platform).toBe('instagram')
  })

  it('creates upload attempt row for each platform', async () => {
    const { UploadCoordinator } = await import('../src/uploaders/UploadCoordinator')
    const coordinator = new UploadCoordinator(
      { upload: uploadMock, checkSession: vi.fn() },
      { upload: uploadMock, checkSession: vi.fn() },
    )

    await coordinator.uploadBothPlatforms(baseJob)

    expect(insertMock).toHaveBeenCalledTimes(2)
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      job_id: JOB_ID,
      platform: 'youtube',
      platform_account_id: YT_ACCT,
      attempt_number: 1,
      status: 'started',
    })
    expect(insertMock.mock.calls[1][0]).toMatchObject({
      job_id: JOB_ID,
      platform: 'instagram',
      platform_account_id: IG_ACCT,
      attempt_number: 1,
    })
  })

  it('successful upload sets per-platform status to uploaded', async () => {
    const { UploadCoordinator } = await import('../src/uploaders/UploadCoordinator')
    const coordinator = new UploadCoordinator(
      { upload: uploadMock, checkSession: vi.fn() },
      { upload: uploadMock, checkSession: vi.fn() },
    )

    await coordinator.uploadBothPlatforms(baseJob)

    const jobUpdates = updateMock.mock.calls.filter(
      (call) => call[0]?.youtube_upload_status === 'uploaded' || call[0]?.instagram_upload_status === 'uploaded',
    )
    expect(jobUpdates.some((c) => c[0].youtube_upload_status === 'uploaded')).toBe(true)
    expect(jobUpdates.some((c) => c[0].instagram_upload_status === 'uploaded')).toBe(true)
  })

  it('failed upload sets per-platform status to failed', async () => {
    uploadMock.mockResolvedValue({
      success: false,
      errorCode: 'YOUTUBE_UPLOAD_FAILED',
      errorMessage: 'Simulated failure',
    })

    const { UploadCoordinator } = await import('../src/uploaders/UploadCoordinator')
    const coordinator = new UploadCoordinator(
      { upload: uploadMock, checkSession: vi.fn() },
      { upload: uploadMock, checkSession: vi.fn() },
    )

    await coordinator.uploadBothPlatforms(baseJob)

    const failedUpdates = updateMock.mock.calls.filter((call) => call[0]?.youtube_upload_status === 'failed')
    expect(failedUpdates.length).toBeGreaterThan(0)
  })

  it('login-required result sets account.login_required = true', async () => {
    uploadMock.mockResolvedValueOnce({
      success: false,
      loginRequired: true,
      errorCode: 'YOUTUBE_LOGIN_REQUIRED',
      errorMessage: 'Session expired',
    })
    uploadMock.mockResolvedValueOnce({
      success: true,
      platformMediaId: 'mock-ig',
      platformUrl: 'https://instagram.com/mock',
    })

    const { UploadCoordinator } = await import('../src/uploaders/UploadCoordinator')
    const coordinator = new UploadCoordinator(
      { upload: uploadMock, checkSession: vi.fn() },
      { upload: uploadMock, checkSession: vi.fn() },
    )

    await coordinator.uploadBothPlatforms(baseJob)

    const accountUpdates = updateMock.mock.calls.filter(
      (call) => call[0]?.login_required === true && call[0]?.status === 'login_required',
    )
    expect(accountUpdates.length).toBeGreaterThan(0)
  })

  it('missing account mapping sets job to needs_manual_review', async () => {
    resolveAccountsMock.mockRejectedValue(
      Object.assign(new Error('Expected exactly 1 active YouTube account'), {
        code: ERROR_CODES.NICHE_ACCOUNT_MAPPING_INVALID,
        name: 'ProjectApiError',
      }),
    )

    const { ProjectApiError } = await import('@project-api/shared')
    resolveAccountsMock.mockRejectedValue(
      new ProjectApiError(
        ERROR_CODES.NICHE_ACCOUNT_MAPPING_INVALID,
        'Expected exactly 1 active YouTube account for niche, found 0',
        { stage: 'upload' },
      ),
    )

    const { UploadCoordinator } = await import('../src/uploaders/UploadCoordinator')
    const coordinator = new UploadCoordinator(
      { upload: uploadMock, checkSession: vi.fn() },
      { upload: uploadMock, checkSession: vi.fn() },
    )

    await expect(coordinator.uploadBothPlatforms(baseJob)).rejects.toMatchObject({
      code: ERROR_CODES.NICHE_ACCOUNT_MAPPING_INVALID,
    })

    expect(updateJobStatusMock).toHaveBeenCalledWith(
      JOB_ID,
      'needs_manual_review',
      expect.objectContaining({ failure_code: ERROR_CODES.NICHE_ACCOUNT_MAPPING_INVALID }),
    )
  })

  it('stores target account IDs on job record', async () => {
    const { UploadCoordinator } = await import('../src/uploaders/UploadCoordinator')
    const coordinator = new UploadCoordinator(
      { upload: uploadMock, checkSession: vi.fn() },
      { upload: uploadMock, checkSession: vi.fn() },
    )

    await coordinator.uploadBothPlatforms(baseJob)

    const targetUpdate = updateMock.mock.calls.find(
      (call) =>
        call[0]?.target_youtube_account_id === YT_ACCT &&
        call[0]?.target_instagram_account_id === IG_ACCT,
    )
    expect(targetUpdate).toBeTruthy()
  })
})