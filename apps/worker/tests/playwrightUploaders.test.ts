import { beforeEach, describe, expect, it, vi } from 'vitest'

const launchContextMock = vi.fn()
const closeMock = vi.fn()
const gotoMock = vi.fn()
const clickMock = vi.fn()
const setInputFilesMock = vi.fn()
const fillMock = vi.fn()
const pressSequentiallyMock = vi.fn()
const waitForMock = vi.fn()
const scrollIntoViewIfNeededMock = vi.fn()
const boundingBoxMock = vi.fn()
const newPageMock = vi.fn()
const detectLoginOrChallengeMock = vi.fn()

const locatorMock = vi.fn(() => ({
  first: () => ({
    isVisible: vi.fn().mockResolvedValue(true),
    click: clickMock,
    fill: fillMock,
    pressSequentially: pressSequentiallyMock,
    waitFor: waitForMock,
    setInputFiles: setInputFilesMock,
    scrollIntoViewIfNeeded: scrollIntoViewIfNeededMock,
    boundingBox: boundingBoxMock,
    press: vi.fn().mockResolvedValue(undefined),
    getAttribute: vi.fn().mockResolvedValue(null),
    count: vi.fn().mockResolvedValue(1),
    focus: vi.fn().mockResolvedValue(undefined),
  }),
  isVisible: vi.fn().mockResolvedValue(true),
  click: clickMock,
  fill: fillMock,
  pressSequentially: pressSequentiallyMock,
  waitFor: waitForMock,
  setInputFiles: setInputFilesMock,
  scrollIntoViewIfNeeded: scrollIntoViewIfNeededMock,
  boundingBox: boundingBoxMock,
  press: vi.fn().mockResolvedValue(undefined),
  getAttribute: vi.fn().mockResolvedValue(null),
  count: vi.fn().mockResolvedValue(1),
  focus: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../src/uploaders/playwrightContext', () => ({
  launchAuthenticatedContext: (...args: unknown[]) => launchContextMock(...args),
}))

vi.mock('../src/uploaders/loginChallengeDetection', () => ({
  detectLoginOrChallenge: (...args: unknown[]) => detectLoginOrChallengeMock(...args),
}))

vi.mock('../src/uploaders/playwrightHumanBehavior', async () => {
  const actualLocator = () =>
    ({
      first: () => ({
        isVisible: vi.fn().mockResolvedValue(true),
        click: clickMock,
        fill: fillMock,
        pressSequentially: pressSequentiallyMock,
        waitFor: waitForMock,
        setInputFiles: setInputFilesMock,
        scrollIntoViewIfNeeded: scrollIntoViewIfNeededMock,
        boundingBox: boundingBoxMock,
        press: vi.fn().mockResolvedValue(undefined),
        getAttribute: vi.fn().mockResolvedValue(null),
        count: vi.fn().mockResolvedValue(1),
        focus: vi.fn().mockResolvedValue(undefined),
      }),
      isVisible: vi.fn().mockResolvedValue(true),
      click: clickMock,
      fill: fillMock,
      pressSequentially: pressSequentiallyMock,
      waitFor: waitForMock,
      setInputFiles: setInputFilesMock,
      scrollIntoViewIfNeeded: scrollIntoViewIfNeededMock,
      boundingBox: boundingBoxMock,
      press: vi.fn().mockResolvedValue(undefined),
      getAttribute: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(1),
      focus: vi.fn().mockResolvedValue(undefined),
    }) as unknown

  return {
    humanPause: vi.fn().mockResolvedValue(undefined),
    humanReadingPause: vi.fn().mockResolvedValue(undefined),
    humanIdleMotion: vi.fn().mockResolvedValue(undefined),
    humanClick: vi.fn(async (_page: unknown, locator: { click: () => Promise<void> }) => {
      await locator.click()
    }),
    humanType: vi.fn(
      async (
        locator: { fill: (v: string) => Promise<void>; pressSequentially: (v: string) => Promise<void> },
        text: string,
        options?: { clearFirst?: boolean },
      ) => {
        if (options?.clearFirst) await locator.fill('')
        await locator.pressSequentially(text)
      },
    ),
    humanScroll: vi.fn().mockResolvedValue(undefined),
    humanSetFiles: vi.fn().mockResolvedValue(undefined),
    firstAttached: vi.fn(async () => actualLocator()),
    clickFirstVisible: vi.fn(async () => true),
  }
})

vi.mock('../src/logging/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

const baseInput = {
  jobId: 'job-pw-1',
  nicheSlug: 'memes',
  driveFileId: 'drive-1',
  platform: 'youtube' as const,
  account: {
    id: 'acct-yt',
    accountLabel: 'Memes YouTube',
    browserProfilePath: '/opt/project-ap-i/playwright-profiles/memes-yt',
  },
  metadata: {
    youtubeTitle: 'Test title',
    youtubeDescription: 'Test description',
  },
  localFilePath: '/tmp/processed.mp4',
}

function setupPageMocks(options?: { throwOnPublish?: boolean }) {
  gotoMock.mockResolvedValue(undefined)
  clickMock.mockResolvedValue(undefined)
  setInputFilesMock.mockImplementation(async () => {
    if (options?.throwOnPublish) {
      throw new Error('sign in required to publish')
    }
  })
  fillMock.mockResolvedValue(undefined)
  pressSequentiallyMock.mockResolvedValue(undefined)
  waitForMock.mockResolvedValue(undefined)
  scrollIntoViewIfNeededMock.mockResolvedValue(undefined)
  boundingBoxMock.mockResolvedValue({ x: 10, y: 10, width: 100, height: 40 })
  closeMock.mockResolvedValue(undefined)

  newPageMock.mockResolvedValue({
    goto: gotoMock,
    locator: locatorMock,
    keyboard: {
      press: vi.fn().mockResolvedValue(undefined),
      type: vi.fn().mockResolvedValue(undefined),
    },
    screenshot: vi.fn().mockResolvedValue(Buffer.from('')),
    mouse: {
      move: vi.fn().mockResolvedValue(undefined),
      click: vi.fn().mockResolvedValue(undefined),
      wheel: vi.fn().mockResolvedValue(undefined),
    },
  })

  launchContextMock.mockResolvedValue({
    newPage: newPageMock,
    close: closeMock,
  })

  detectLoginOrChallengeMock.mockResolvedValue({ loginRequired: false })
}

describe('YoutubePlaywrightUploader', () => {
  beforeEach(() => {
    vi.resetModules()
    launchContextMock.mockReset()
    closeMock.mockReset()
    gotoMock.mockReset()
    clickMock.mockReset()
    setInputFilesMock.mockReset()
    detectLoginOrChallengeMock.mockReset()
    locatorMock.mockClear()
  })

  it('returns UPLOAD_FLAG_DISABLED when REAL_UPLOADS_ENABLED is false', async () => {
    vi.doMock('../src/config', () => ({
      config: {
        REAL_UPLOADS_ENABLED: false,
        YOUTUBE_UPLOADS_ENABLED: false,
      },
    }))

    const { YoutubePlaywrightUploader } = await import('../src/uploaders/YoutubePlaywrightUploader')
    const uploader = new YoutubePlaywrightUploader()
    const result = await uploader.upload(baseInput)

    expect(result.success).toBe(false)
    expect(result.errorCode).toBe('UPLOAD_FLAG_DISABLED')
    expect(launchContextMock).not.toHaveBeenCalled()
  })

  it('login page detection returns YOUTUBE_LOGIN_REQUIRED', async () => {
    vi.doMock('../src/config', () => ({
      config: {
        REAL_UPLOADS_ENABLED: true,
        YOUTUBE_UPLOADS_ENABLED: true,
      },
    }))

    setupPageMocks()
    detectLoginOrChallengeMock.mockResolvedValue({
      loginRequired: true,
      challengeType: 'login_form',
      reason: 'Login form detected',
    })

    const { YoutubePlaywrightUploader } = await import('../src/uploaders/YoutubePlaywrightUploader')
    const uploader = new YoutubePlaywrightUploader()
    const result = await uploader.upload(baseInput)

    expect(result.success).toBe(false)
    expect(result.errorCode).toBe('YOUTUBE_LOGIN_REQUIRED')
    expect(result.loginRequired).toBe(true)
    expect(closeMock).toHaveBeenCalled()
  })

  it('does not log passwords or cookies', async () => {
    vi.doMock('../src/config', () => ({
      config: {
        REAL_UPLOADS_ENABLED: true,
        YOUTUBE_UPLOADS_ENABLED: true,
      },
    }))

    setupPageMocks()

    const { logger } = await import('../src/logging/logger')
    const { YoutubePlaywrightUploader } = await import('../src/uploaders/YoutubePlaywrightUploader')
    const uploader = new YoutubePlaywrightUploader()
    await uploader.upload(baseInput)

    const logCalls = [
      ...(logger.info as ReturnType<typeof vi.fn>).mock.calls,
      ...(logger.warn as ReturnType<typeof vi.fn>).mock.calls,
      ...(logger.error as ReturnType<typeof vi.fn>).mock.calls,
    ]

    const serialized = JSON.stringify(logCalls).toLowerCase()
    expect(serialized).not.toContain('password')
    expect(serialized).not.toContain('cookie')
    expect(serialized).not.toContain('sessionid')
  })

  it('closes browser context in finally block on error', async () => {
    vi.doMock('../src/config', () => ({
      config: {
        REAL_UPLOADS_ENABLED: true,
        YOUTUBE_UPLOADS_ENABLED: true,
      },
    }))

    setupPageMocks({ throwOnPublish: true })

    const { YoutubePlaywrightUploader } = await import('../src/uploaders/YoutubePlaywrightUploader')
    const uploader = new YoutubePlaywrightUploader()
    const result = await uploader.upload(baseInput)

    expect(result.success).toBe(false)
    expect(result.loginRequired).toBe(true)
    expect(closeMock).toHaveBeenCalled()
  })

  it('completes upload when session is valid', async () => {
    vi.doMock('../src/config', () => ({
      config: {
        REAL_UPLOADS_ENABLED: true,
        YOUTUBE_UPLOADS_ENABLED: true,
      },
    }))

    setupPageMocks()

    const { YoutubePlaywrightUploader } = await import('../src/uploaders/YoutubePlaywrightUploader')
    const uploader = new YoutubePlaywrightUploader()
    const result = await uploader.upload(baseInput)

    expect(result.success).toBe(true)
    expect(result.platformMediaId).toMatch(/^yt-job-pw-1-/)
    expect(closeMock).toHaveBeenCalled()
    expect(gotoMock).toHaveBeenCalledWith('https://www.youtube.com/', expect.any(Object))
  })
})

describe('InstagramPlaywrightUploader', () => {
  beforeEach(() => {
    vi.resetModules()
    launchContextMock.mockReset()
    closeMock.mockReset()
  })

  it('returns loginRequired when no browser profile is configured', async () => {
    vi.doMock('../src/config', () => ({
      config: {
        REAL_UPLOADS_ENABLED: true,
        INSTAGRAM_UPLOADS_ENABLED: true,
      },
    }))

    const { InstagramPlaywrightUploader } = await import('../src/uploaders/InstagramPlaywrightUploader')
    const uploader = new InstagramPlaywrightUploader()
    const result = await uploader.upload({
      ...baseInput,
      platform: 'instagram',
      account: { id: 'acct-ig', accountLabel: 'Memes IG' },
      metadata: { instagramCaption: 'Caption' },
    })

    expect(result.success).toBe(false)
    expect(result.errorCode).toBe('INSTAGRAM_LOGIN_REQUIRED')
    expect(result.loginRequired).toBe(true)
  })
})
