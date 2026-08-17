import { config } from './config'
import { startCollectorScheduler } from './collector/collectorScheduler'
import { startWorkerHeartbeat } from './heartbeat/workerHeartbeat'
import { logger } from './logging/logger'
import { buildServer } from './server'

async function main(): Promise<void> {
  const app = await buildServer()

  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' })
    logger.info({ msg: 'Worker started', port: config.PORT, env: config.NODE_ENV })
    startWorkerHeartbeat()
    startCollectorScheduler()
  } catch (err) {
    logger.error({ msg: 'Failed to start worker', err })
    process.exit(1)
  }
}

void main()
