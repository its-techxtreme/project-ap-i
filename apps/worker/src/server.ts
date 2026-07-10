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

  // n8n HTTP Request nodes often send Content-Type: application/json with an empty body.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    try {
      const text = typeof body === 'string' ? body : body?.toString?.() ?? ''
      if (!text || !text.trim()) {
        done(null, {})
        return
      }
      done(null, JSON.parse(text))
    } catch (err) {
      done(err as Error, undefined)
    }
  })

  app.addHook('onRequest', requestLoggerHook)

  await app.register(healthRoutes)
  await app.register(jobRoutes)

  return app
}
