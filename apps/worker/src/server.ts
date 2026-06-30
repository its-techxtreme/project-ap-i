import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import Fastify from 'fastify'

import { healthRoutes } from './api/health'
import { jobRoutes } from './api/jobs'
import { requestLoggerHook } from './middleware/requestLogger'

export async function buildServer() {
  const app = Fastify({ logger: false })

  await app.register(cors, { origin: false })
  await app.register(helmet)

  app.addHook('onRequest', requestLoggerHook)

  await app.register(healthRoutes)
  await app.register(jobRoutes)

  return app
}
