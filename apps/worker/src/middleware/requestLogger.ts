import type { FastifyReply, FastifyRequest } from 'fastify'

import { logger } from '../logging/logger'

export async function requestLoggerHook(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  reply.raw.on('finish', () => {
    logger.info({
      msg: 'request completed',
      method: request.method,
      path: request.url,
      statusCode: reply.statusCode,
    })
  })
}
