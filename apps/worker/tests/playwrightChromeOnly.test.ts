import { afterEach, describe, expect, it, vi } from 'vitest'

describe('Chrome-only real upload gate', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('launchAuthenticatedContext rejects non-chrome channel when real uploads enabled', async () => {
    vi.resetModules()
    vi.doMock('../src/config', () => ({
      config: {
        REAL_UPLOADS_ENABLED: true,
        PLAYWRIGHT_CHANNEL: 'chromium',
        PLAYWRIGHT_HEADLESS: true,
        PLAYWRIGHT_SLOW_MO_MS: 0,
        PLAYWRIGHT_CHROME_PATH: undefined,
      },
    }))

    const { launchAuthenticatedContext } = await import('../src/uploaders/playwrightContext')
    await expect(launchAuthenticatedContext('/tmp/fake-profile')).rejects.toThrow(
      /PLAYWRIGHT_CHANNEL=chrome/,
    )
  })

  it('YouTube uploader selectors target NOT made for kids only', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/uploaders/YoutubePlaywrightUploader.ts'),
      'utf8',
    )
    expect(src).toContain('VIDEO_MADE_FOR_KIDS_NOT_MFK')
    expect(src).toContain("No, it's not made for kids")
    expect(src).toContain('selectNotMadeForKids')
    expect(src).toContain('recoverFromKidsHelpPage')
    expect(src).toContain('clickNotMadeForKidsRadio')
    expect(src).toContain('isNotMadeForKidsSelected')
    expect(src).toContain('waitForYoutubeDetailsSaved')
    // Bare text= matches Learn more / help and navigates away from Studio.
    expect(src).not.toMatch(/'text=No, it\\'s not made for kids'/)
    expect(src).not.toMatch(/VIDEO_MADE_FOR_KIDS_MFK[^_]/)
    expect(src).not.toMatch(/Yes, it's made for kids/)
  })

  it('Instagram uploader requires real reel URL and forbids synthetic ig- media ids', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/uploaders/InstagramPlaywrightUploader.ts'),
      'utf8',
    )
    expect(src).toContain('captureLatestReelUrl')
    expect(src).toContain('captureShareSuccessMediaUrl')
    expect(src).toContain('dismissBlockingDialogs')
    expect(src).toContain('baselineReelUrl')
    expect(src).toContain('platformMediaId: reelUrl')
    expect(src).not.toMatch(/platformMediaId:\s*`ig-\$\{/)
    expect(src).toContain('will not scrape feed links as a fake success')
    expect(src).toContain('Treating as FAILED')
  })
})
