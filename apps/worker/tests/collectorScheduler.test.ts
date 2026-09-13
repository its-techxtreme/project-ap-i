import { beforeEach, describe, expect, it, vi } from 'vitest'

const waitForPipelineIdle = vi.fn()
const scrapeUnreadCollectorInbox = vi.fn()
const persistCollectedReels = vi.fn()
const rejectBogusCollectorInboxItems = vi.fn()
const setCollectorHold = vi.fn()
const setCollectorUsingChrome = vi.fn()
const pullCollectorControl = vi.fn()
const collectorMayRun = vi.fn()
const markCollectorRunUsed = vi.fn()

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

vi.mock('../src/collector/collectorControl', () => ({
  pullCollectorControl: () => pullCollectorControl(),
  collectorMayRun: (control: unknown) => collectorMayRun(control),
  markCollectorRunUsed: (daily: unknown) => markCollectorRunUsed(daily),
  persistCollectorLoginRequired: () => Promise.resolve(),
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
    pullCollectorControl.mockReset()
    collectorMayRun.mockReset()
    markCollectorRunUsed.mockReset()
    pullCollectorControl.mockResolvedValue({ armed: true, daily: { day: '2026-09-10', runs: [] } })
    collectorMayRun.mockReturnValue({ ok: true })
    markCollectorRunUsed.mockImplementation(async (daily: { day: string; runs: string[] }) => ({
      ok: true,
      daily: { day: daily.day, runs: [...daily.runs, new Date().toISOString()] },
    }))
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

  it('does not hold the pipeline when the switch is off', async () => {
    collectorMayRun.mockReturnValue({ ok: false, reason: 'Collector switch is off' })
    const { runCollectorCycle } = await import('../src/collector/collectorScheduler')
    await runCollectorCycle()
    expect(setCollectorHold).not.toHaveBeenCalledWith(true)
    expect(scrapeUnreadCollectorInbox).not.toHaveBeenCalled()
  })

  it('does not scrape when daily run persist fails', async () => {
    markCollectorRunUsed.mockResolvedValue({
      ok: false,
      daily: { day: '2026-09-10', runs: [] },
      error: 'db down',
    })
    const { runCollectorCycle } = await import('../src/collector/collectorScheduler')
    await runCollectorCycle()
    expect(scrapeUnreadCollectorInbox).not.toHaveBeenCalled()
    expect(persistCollectedReels).not.toHaveBeenCalled()
  })

  it('runs only one scrape when two cycles overlap', async () => {
    waitForPipelineIdle.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(true), 40)),
    )
    const { runCollectorCycle } = await import('../src/collector/collectorScheduler')
    await Promise.all([runCollectorCycle(), runCollectorCycle()])
    expect(scrapeUnreadCollectorInbox).toHaveBeenCalledTimes(1)
  })
})
