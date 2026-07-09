import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('uploaderFactory', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns MockUploader when REAL_UPLOADS_ENABLED is false', async () => {
    vi.doMock('../src/config', () => ({
      config: {
        REAL_UPLOADS_ENABLED: false,
        YOUTUBE_UPLOADS_ENABLED: true,
        INSTAGRAM_UPLOADS_ENABLED: true,
      },
    }))

    const { createYoutubeUploader, createInstagramUploader } = await import('../src/uploaders/uploaderFactory')
    const { MockUploader } = await import('../src/uploaders/MockUploader')

    expect(createYoutubeUploader()).toBeInstanceOf(MockUploader)
    expect(createInstagramUploader()).toBeInstanceOf(MockUploader)
  })

  it('returns MockUploader for YouTube when YOUTUBE_UPLOADS_ENABLED is false', async () => {
    vi.doMock('../src/config', () => ({
      config: {
        REAL_UPLOADS_ENABLED: true,
        YOUTUBE_UPLOADS_ENABLED: false,
        INSTAGRAM_UPLOADS_ENABLED: true,
      },
    }))

    const { createYoutubeUploader, createInstagramUploader } = await import('../src/uploaders/uploaderFactory')
    const { MockUploader } = await import('../src/uploaders/MockUploader')
    const { InstagramPlaywrightUploader } = await import('../src/uploaders/InstagramPlaywrightUploader')

    expect(createYoutubeUploader()).toBeInstanceOf(MockUploader)
    expect(createInstagramUploader()).toBeInstanceOf(InstagramPlaywrightUploader)
  })

  it('returns MockUploader for Instagram when INSTAGRAM_UPLOADS_ENABLED is false', async () => {
    vi.doMock('../src/config', () => ({
      config: {
        REAL_UPLOADS_ENABLED: true,
        YOUTUBE_UPLOADS_ENABLED: true,
        INSTAGRAM_UPLOADS_ENABLED: false,
      },
    }))

    const { createYoutubeUploader, createInstagramUploader } = await import('../src/uploaders/uploaderFactory')
    const { MockUploader } = await import('../src/uploaders/MockUploader')
    const { YoutubePlaywrightUploader } = await import('../src/uploaders/YoutubePlaywrightUploader')

    expect(createYoutubeUploader()).toBeInstanceOf(YoutubePlaywrightUploader)
    expect(createInstagramUploader()).toBeInstanceOf(MockUploader)
  })

  it('returns Playwright uploaders when all flags are enabled', async () => {
    vi.doMock('../src/config', () => ({
      config: {
        REAL_UPLOADS_ENABLED: true,
        YOUTUBE_UPLOADS_ENABLED: true,
        INSTAGRAM_UPLOADS_ENABLED: true,
      },
    }))

    const { createYoutubeUploader, createInstagramUploader } = await import('../src/uploaders/uploaderFactory')
    const { YoutubePlaywrightUploader } = await import('../src/uploaders/YoutubePlaywrightUploader')
    const { InstagramPlaywrightUploader } = await import('../src/uploaders/InstagramPlaywrightUploader')

    expect(createYoutubeUploader()).toBeInstanceOf(YoutubePlaywrightUploader)
    expect(createInstagramUploader()).toBeInstanceOf(InstagramPlaywrightUploader)
  })
})

describe('Playwright uploader flag-disabled errors', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('YoutubePlaywrightUploader returns UPLOAD_FLAG_DISABLED when flags are false', async () => {
    vi.doMock('../src/config', () => ({
      config: {
        REAL_UPLOADS_ENABLED: false,
        YOUTUBE_UPLOADS_ENABLED: false,
      },
    }))

    const { YoutubePlaywrightUploader } = await import('../src/uploaders/YoutubePlaywrightUploader')
    const uploader = new YoutubePlaywrightUploader()

    const result = await uploader.upload({
      jobId: 'job-1',
      nicheSlug: 'memes',
      driveFileId: 'drive-1',
      platform: 'youtube',
      account: { id: 'acct-1', accountLabel: 'Memes YT', browserProfilePath: '/tmp/profile' },
      metadata: {},
      localFilePath: '/tmp/video.mp4',
    })

    expect(result.success).toBe(false)
    expect(result.errorCode).toBe('UPLOAD_FLAG_DISABLED')
  })

  it('InstagramPlaywrightUploader returns UPLOAD_FLAG_DISABLED when flags are false', async () => {
    vi.doMock('../src/config', () => ({
      config: {
        REAL_UPLOADS_ENABLED: false,
        INSTAGRAM_UPLOADS_ENABLED: false,
      },
    }))

    const { InstagramPlaywrightUploader } = await import('../src/uploaders/InstagramPlaywrightUploader')
    const uploader = new InstagramPlaywrightUploader()

    const result = await uploader.upload({
      jobId: 'job-1',
      nicheSlug: 'memes',
      driveFileId: 'drive-1',
      platform: 'instagram',
      account: { id: 'acct-1', accountLabel: 'Memes IG', browserProfilePath: '/tmp/profile' },
      metadata: {},
      localFilePath: '/tmp/video.mp4',
    })

    expect(result.success).toBe(false)
    expect(result.errorCode).toBe('UPLOAD_FLAG_DISABLED')
  })
})
