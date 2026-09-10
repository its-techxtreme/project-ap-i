import { config } from '../config'
import { logger } from '../logging/logger'

import {
  isCollectorHold,
  setCollectorHold,
  setCollectorUsingChrome,
  waitForPipelineIdle,
} from './collectorHold'
import {
  collectorMayRun,
  markCollectorRunUsed,
  pullCollectorControl,
} from './collectorControl'
import { COLLECTOR_MAX_RUNS_PER_DAY } from './collectorDailyBudget'
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

  try {
    let control = await pullCollectorControl()
    collectorSnapshot.armed = control.armed
    collectorSnapshot.runsToday = control.daily.runs.length
    let gate = collectorMayRun(control)
    if (!gate.ok) {
      logger.info({ msg: 'Collector cycle skipped', reason: gate.reason })
      return
    }

    setCollectorHold(true)
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

    control = await pullCollectorControl()
    collectorSnapshot.armed = control.armed
    collectorSnapshot.runsToday = control.daily.runs.length
    gate = collectorMayRun(control)
    if (!gate.ok) {
      logger.info({ msg: 'Collector cycle skipped after wait', reason: gate.reason })
      return
    }

    const used = await markCollectorRunUsed(control.daily)
    if (!used.ok) {
      collectorSnapshot.lastError = used.error
      collectorSnapshot.lastAt = new Date().toISOString()
      logger.warn({ msg: 'Collector skipped — could not record daily run', error: used.error })
      return
    }
    collectorSnapshot.runsToday = used.daily.runs.length
    logger.info({
      msg: 'Collector cycle starting',
      run: used.daily.runs.length,
      maxRuns: COLLECTOR_MAX_RUNS_PER_DAY,
      day: used.daily.day,
    })
    await rejectBogusCollectorInboxItems()
    setCollectorUsingChrome(true)
    // Do not race a dummy timeout against Playwright. That used to mark the
    // cycle failed with zero items while Chrome was still harvesting.
    const scrape = await scrapeUnreadCollectorInbox()

    if (scrape.items.length > 0) {
      const persisted: PersistResult = await persistCollectedReels(scrape.items)
      collectorSnapshot.lastAt = new Date().toISOString()
      collectorSnapshot.lastQueued = persisted.queued
      collectorSnapshot.lastPendingNiche = persisted.pendingNiche
      collectorSnapshot.lastDuplicate = persisted.duplicate
      collectorSnapshot.lastInvalid = persisted.invalid
      logger.info({ msg: 'Collector persist finished', ...persisted, itemCount: scrape.items.length })
    }

    if (!scrape.ok) {
      collectorSnapshot.loginRequired = scrape.loginRequired
      collectorSnapshot.lastError = scrape.error
      collectorSnapshot.lastAt = new Date().toISOString()
      logger.error({ msg: 'Collector cycle finished with errors', error: scrape.error })
      return
    }

    collectorSnapshot.loginRequired = false
    collectorSnapshot.lastError = null
    logger.info({ msg: 'Collector cycle complete', itemCount: scrape.items.length })
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
