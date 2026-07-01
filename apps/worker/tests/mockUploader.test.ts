import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MockUploader } from '../src/uploaders/MockUploader'

const updateMock = vi.fn()
const eqMock = vi.fn()
const insertMock = vi.fn()
const selectMock = vi.fn()
const singleMock = vi.fn()
const fromMock = vi.fn()
const writeJobEventMock = vi.fn()

vi.mock('../src/db/jobsRepo', () => ({
  writeJobEvent: (...args: unknown[]) => writeJobEventMock(...args),
}))

vi.mock('../src/db/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}))

vi.mock('../src/uploaders/accountResolver', () => ({
  resolveNicheAccounts: vi.fn().mockResolvedValue({
    youtube: { id: 'yt-acct', accountLabel: 'Memes YT' },
    instagram: { id: 'ig-acct', accountLabel: 'Memes IG' },
  }),
}))

describe('MockUploader', () => {
  beforeEach(() => {
    updateMock.mockReset()
    eqMock.mockReset()
    insertMock.mockReset()
    selectMock.mockReset()
    singleMock.mockReset()
    fromMock.mockReset()
    writeJobEventMock.mockReset()

    eqMock.mockReturnValue({ error: null })
    updateMock.mockReturnValue({ eq: eqMock })
    let attemptCounter = 0
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
  })

  const baseInput = {
    jobId: 'job-mock-1',
    nicheSlug: 'memes',
    driveFileId: 'drive-file-1',
    platform: 'youtube' as const,
    account: { id: 'acct-yt', accountLabel: 'Memes YouTube' },
    metadata: { youtubeTitle: 'Test title', youtubeDescription: 'Test desc' },
  }

  it('default MockUploader always succeeds', async () => {
    const uploader = new MockUploader()
    const result = await uploader.upload(baseInput)

    expect(result.success).toBe(true)
  })

  it('shouldFail: true MockUploader always fails', async () => {
    const uploader = new MockUploader({ shouldFail: true })
    const result = await uploader.upload(baseInput)

    expect(result.success).toBe(false)
    expect(result.errorCode).toBe('YOUTUBE_UPLOAD_FAILED')
    expect(result.errorMessage).toContain('[MOCK]')
  })

  it('upload result includes platformMediaId and platformUrl on success', async () => {
    const uploader = new MockUploader()
    const result = await uploader.upload(baseInput)

    expect(result.platformMediaId).toBe('mock-youtube-job-mock-1')
    expect(result.platformUrl).toBe('https://youtube.com/mock/job-mock-1')
  })

  it('checkSession returns healthy', async () => {
    const uploader = new MockUploader()
    const health = await uploader.checkSession('acct-yt')

    expect(health.healthy).toBe(true)
  })

  it('upload attempt record is written with correct status', async () => {
    const { UploadCoordinator } = await import('../src/uploaders/UploadCoordinator')
    const coordinator = new UploadCoordinator(new MockUploader(), new MockUploader())

    await coordinator.uploadBothPlatforms({
      id: 'job-mock-attempt',
      nicheId: 'niche-1',
      nicheSlug: 'memes',
      driveFileId: 'drive-1',
      youtubeRetryCount: 0,
      instagramRetryCount: 0,
    })

    const attemptUpdates = updateMock.mock.calls.filter(
      (call) => call[0]?.status === 'uploaded' && call[0]?.finished_at,
    )
    expect(attemptUpdates).toHaveLength(2)
    expect(insertMock).toHaveBeenCalledTimes(2)
  })
})
