import { config } from '../config'
import { logger } from '../logging/logger'

import {
  isCollectorHold,
  setCollectorHold,
  setCollectorUsingChrome,
  waitForPipelineIdle,
} from './collectorHold'
import { collectorSnapshot } from './collectorState'
import { scrapeUnreadCollectorInbox } from './instagramDmCollector'
import {
  persistCollectedReels,
  rejectBogusCollectorInboxItems,
  type PersistResult,
} from './persistCollectedReels'

export { getCollectorSnapshot } from './collectorState'
export type { CollectorSnapshot } from './collectorState'

export async function runCollectorCycle(): Promise<void> {
  if (!config.COLLECTOR_ENABLED) return
  if (collectorSnapshot.running) {
    logger.info({ msg: 'Collector cycle skipped — already running' })
    return
  }

  collectorSnapshot.running = true
  setCollectorHold(true)
  try {
    const idle = await waitForPipelineIdle({
      timeoutMs: Math.max(60_000, config.COLLECTOR_RUN_TIMEOUT_MS),
      pollMs: 5_000,
    })
    if (!idle) {
      collectorSnapshot.lastError = 'Timed out waiting for current job to finish'
      collectorSnapshot.lastAt = new Date().toISOString()
      logger.warn({ msg: 'Collector skipped — pipeline did not go idle in time' })
      return
    }

    logger.info({ msg: 'Collector cycle starting' })
    await rejectBogusCollectorInboxItems()
    setCollectorUsingChrome(true)
    const scrape = await Promise.race([
      scrapeUnreadCollectorInbox(),
      timeoutResult(config.COLLECTOR_RUN_TIMEOUT_MS),
    ])

    if (!scrape.ok) {
      collectorSnapshot.loginRequired = scrape.loginRequired
      collectorSnapshot.lastError = scrape.error
      collectorSnapshot.lastAt = new Date().toISOString()
      return
    }

    const persisted: PersistResult = await persistCollectedReels(scrape.items)
    collectorSnapshot.lastAt = new Date().toISOString()
    collectorSnapshot.lastQueued = persisted.queued
    collectorSnapshot.lastPendingNiche = persisted.pendingNiche
    collectorSnapshot.lastDuplicate = persisted.duplicate
    collectorSnapshot.lastInvalid = persisted.invalid
    collectorSnapshot.loginRequired = false
    collectorSnapshot.lastError = null
    logger.info({ msg: 'Collector cycle complete', ...persisted, itemCount: scrape.items.length })
  } catch (err) {
    collectorSnapshot.lastError = err instanceof Error ? err.message : String(err)
    collectorSnapshot.lastAt = new Date().toISOString()
    logger.warn({ msg: 'Collector cycle failed', error: collectorSnapshot.lastError })
  } finally {
    setCollectorUsingChrome(false)
    collectorSnapshot.running = false
    setCollectorHold(false)
  }
}

function timeoutResult(ms: number): Promise<{
  ok: false
  items: []
  loginRequired: false
  error: string
}> {
  return new Promise((resolve) => {
    setTimeout(
      () =>
        resolve({
          ok: false,
          items: [],
          loginRequired: false,
          error: `Collector scrape timed out after ${ms}ms`,
        }),
      ms,
    )
  })
}

export function startCollectorScheduler(): () => void {
  if (config.NODE_ENV === 'test' || !config.COLLECTOR_ENABLED) {
    return () => undefined
  }

  logger.info({
    msg: 'Collector scheduler started',
    intervalMs: config.COLLECTOR_INTERVAL_MS,
    profile: config.COLLECTOR_PROFILE,
  })

  void runCollectorCycle()
  const timer = setInterval(() => {
    if (isCollectorHold()) return
    void runCollectorCycle()
  }, config.COLLECTOR_INTERVAL_MS)

  return () => clearInterval(timer)
}
