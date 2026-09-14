import type { FastifyReply, FastifyRequest } from 'fastify'

import { config } from '../config'
import { logger } from '../logging/logger'
import { validateWorkerToken } from '../security/validateWorkerToken'

/** x-worker-token. 401 missing 403 wrong. */
export async function workerAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = request.headers['x-worker-token']

  if (!token || typeof token !== 'string') {
    logger.warn({ msg: 'Missing worker token', ip: request.ip, path: request.url })
    await reply.status(401).send({ error: 'Authentication required.' })
    return
  }

  if (!validateWorkerToken(token, config.WORKER_INTERNAL_TOKEN)) {
    logger.warn({ msg: 'Invalid worker token', ip: request.ip, path: request.url })
    await reply.status(403).send({ error: 'Forbidden.' })
    return
  }
}
