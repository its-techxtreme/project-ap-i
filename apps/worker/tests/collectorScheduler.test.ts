import { beforeEach, describe, expect, it, vi } from 'vitest'

const waitForPipelineIdle = vi.fn()
const scrapeUnreadCollectorInbox = vi.fn()
const persistCollectedReels = vi.fn()
const rejectBogusCollectorInboxItems = vi.fn()
const setCollectorHold = vi.fn()
const setCollectorUsingChrome = vi.fn()

vi.mock('../src/config', () => ({
  config: {
    COLLECTOR_ENABLED: true,
    COLLECTOR_RUN_TIMEOUT_MS: 5_000,
    COLLECTOR_INTERVAL_MS: 10_800_000,
    COLLECTOR_PROFILE: 'ig-collector',
    NODE_ENV: 'test',
  },
}))

vi.mock('../src/collector/collectorHold', () => ({
  isCollectorHold: () => false,
  setCollectorHold: (...args: unknown[]) => setCollectorHold(...args),
  setCollectorUsingChrome: (...args: unknown[]) => setCollectorUsingChrome(...args),
  waitForPipelineIdle: (...args: unknown[]) => waitForPipelineIdle(...args),
}))

vi.mock('../src/collector/instagramDmCollector', () => ({
  scrapeUnreadCollectorInbox: () => scrapeUnreadCollectorInbox(),
}))

vi.mock('../src/collector/persistCollectedReels', () => ({
  persistCollectedReels: (...args: unknown[]) => persistCollectedReels(...args),
  rejectBogusCollectorInboxItems: (...args: unknown[]) => rejectBogusCollectorInboxItems(...args),
}))

vi.mock('../src/logging/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

describe('runCollectorCycle', () => {
  beforeEach(() => {
    vi.resetModules()
    waitForPipelineIdle.mockReset()
    scrapeUnreadCollectorInbox.mockReset()
    persistCollectedReels.mockReset()
    rejectBogusCollectorInboxItems.mockReset()
    rejectBogusCollectorInboxItems.mockResolvedValue(0)
    waitForPipelineIdle.mockResolvedValue(true)
    scrapeUnreadCollectorInbox.mockResolvedValue({
      ok: true,
      items: [{ sourceUrl: 'https://www.instagram.com/reel/x/', nearbyText: 'anime' }],
      loginRequired: false,
    })
    persistCollectedReels.mockResolvedValue({
      queued: 1,
      pendingNiche: 0,
      duplicate: 0,
      invalid: 0,
    })
    setCollectorHold.mockReset()
    setCollectorUsingChrome.mockReset()
  })

  it('holds claims, waits for idle, then scrapes', async () => {
    const { runCollectorCycle, getCollectorSnapshot } = await import(
      '../src/collector/collectorScheduler'
    )
    await runCollectorCycle()
    expect(setCollectorHold).toHaveBeenCalledWith(true)
    expect(waitForPipelineIdle).toHaveBeenCalled()
    expect(setCollectorUsingChrome).toHaveBeenCalledWith(true)
    expect(scrapeUnreadCollectorInbox).toHaveBeenCalled()
    expect(rejectBogusCollectorInboxItems).toHaveBeenCalled()
    expect(persistCollectedReels).toHaveBeenCalled()
    expect(setCollectorHold).toHaveBeenLastCalledWith(false)
    expect(setCollectorUsingChrome).toHaveBeenLastCalledWith(false)
    expect(getCollectorSnapshot().lastQueued).toBe(1)
    expect(getCollectorSnapshot().running).toBe(false)
  })

  it('does not scrape when the current job never goes idle', async () => {
    waitForPipelineIdle.mockImplementation(async () => false)
    const { runCollectorCycle } = await import('../src/collector/collectorScheduler')
    await runCollectorCycle()
    expect(persistCollectedReels).not.toHaveBeenCalled()
    expect(scrapeUnreadCollectorInbox).not.toHaveBeenCalled()
    expect(setCollectorHold).toHaveBeenLastCalledWith(false)
  })
})
