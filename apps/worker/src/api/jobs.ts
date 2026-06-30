import crypto from 'node:crypto'

import type { FastifyInstance } from 'fastify'

import { writeJobEvent } from '../db/jobsRepo'
import { claimJob } from '../jobs/claimJob'
import { runMockProcess, runMockUpload, runMockVerify } from '../jobs/processJob'
import { logger } from '../logging/logger'
import { workerAuthMiddleware } from '../middleware/workerAuth'

const WORKER_ID = `worker-${crypto.randomBytes(4).toString('hex')}`

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', workerAuthMiddleware)

  app.post('/jobs/claim', async (_request, reply) => {
    const job = await claimJob(WORKER_ID)
    if (!job) {
      return reply.send({ claimed: false, job: null })
    }

    logger.info({ msg: 'Job claimed', jobId: job.id, workerId: WORKER_ID })
    await writeJobEvent(job.id, 'claim', 'job_locked', `Job locked by ${WORKER_ID}`)

    return reply.send({
      claimed: true,
      job: { id: job.id, status: job.status },
    })
  })

  app.post('/jobs/:id/process', async (request, reply) => {
    const { id } = request.params as { id: string }
    logger.info({ msg: 'Mock process started', jobId: id })

    const finalStatus = await runMockProcess(id)
    return reply.send({ success: true, jobId: id, finalStatus })
  })

  app.post('/jobs/:id/upload', async (request, reply) => {
    const { id } = request.params as { id: string }
    const result = await runMockUpload(id)

    if (typeof result === 'object' && result.blocked) {
      return reply.status(503).send({
        error: 'Real uploads not implemented yet. Use mock mode.',
      })
    }

    return reply.send({ success: true, jobId: id, finalStatus: result })
  })

  app.post('/jobs/:id/verify', async (request, reply) => {
    const { id } = request.params as { id: string }
    const finalStatus = await runMockVerify(id)
    return reply.send({ success: true, jobId: id, finalStatus })
  })

  app.post('/jobs/:id/retry-upload', async (_request, reply) => {
    return reply.status(501).send({ error: 'Not implemented yet. Coming in Phase 11.' })
  })

  app.post('/jobs/:id/delete-drive-file', async (_request, reply) => {
    return reply.status(501).send({ error: 'Not implemented yet. Coming in Phase 11.' })
  })
}

export { WORKER_ID }
