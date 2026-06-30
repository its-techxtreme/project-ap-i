import type { FastifyInstance } from 'fastify'

import { config } from '../config'

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request, reply) => {
    return reply.send({
      ok: true,
      version: '0.1.0',
      env: config.NODE_ENV,
      realUploadsEnabled: config.REAL_UPLOADS_ENABLED,
      checks: {
        supabase: 'not_checked',
        ffmpeg: 'not_installed',
        ytDlp: 'not_installed',
        playwright: 'not_installed',
      },
    })
  })
}
