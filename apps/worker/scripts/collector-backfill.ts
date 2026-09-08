/**
 * One-shot collector scrape + persist (does not restart the worker).
 * Usage: pnpm --filter @project-api/worker exec tsx --env-file=../../.env scripts/collector-backfill.ts
 */
import { scrapeUnreadCollectorInbox } from '../src/collector/instagramDmCollector'
import { persistCollectedReels } from '../src/collector/persistCollectedReels'
import { logger } from '../src/logging/logger'

async function main(): Promise<void> {
  const scrape = await scrapeUnreadCollectorInbox({ headless: false })
  if (!scrape.ok) {
    logger.warn({ msg: 'Collector backfill scrape failed', error: scrape.error, loginRequired: scrape.loginRequired })
    process.exitCode = 1
    return
  }

  logger.info({
    msg: 'Collector backfill scraped',
    itemCount: scrape.items.length,
    urls: scrape.items.map((item) => ({ url: item.sourceUrl, nearby: item.nearbyText, thread: item.threadId })),
  })

  const persisted = await persistCollectedReels(scrape.items)
  logger.info({ msg: 'Collector backfill persisted', ...persisted })
}

void main()
