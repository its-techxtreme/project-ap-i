import crypto from 'node:crypto'

import { ProjectApiError } from '@project-api/shared'
import type { FastifyInstance } from 'fastify'

import { getJobById, writeJobEvent } from '../db/jobsRepo'
import { claimJob } from '../jobs/claimJob'
import { createDriveStorage } from '../storage'
import { deleteJobDriveFile } from '../jobs/driveDelete'
import { processNextAdminCommand } from '../jobs/processAdminCommand'
import { runUpload } from '../jobs/runUpload'
import { runProcessPipeline } from '../jobs/processPipeline'
import { retryJob } from '../jobs/retryJob'
import { verifyJob } from '../jobs/verifyJob'
import { cleanupJob } from '../jobs/cleanupJob'
import { logger } from '../logging/logger'
import { workerAuthMiddleware } from '../middleware/workerAuth'

const WORKER_ID = `worker-${crypto.randomBytes(4).toString('hex')}`

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', workerAuthMiddleware)

  /** Drain one admin outbox command (retry/delete) enqueued by the hosted admin UI. */
  app.post('/admin-commands/process-next', async (_request, reply) => {
    const result = await processNextAdminCommand(WORKER_ID)
    return reply.send(result)
  })

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
    const job = await getJobById(id)

    if (!job) {
      return reply.status(404).send({ error: 'Job not found' })
    }

    logger.info({ msg: 'Process pipeline started', jobId: id })

    try {
      const finalStatus = await runProcessPipeline(job)
      return reply.send({ success: true, jobId: id, finalStatus })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      const code = err instanceof ProjectApiError ? err.code : 'PROCESS_FAILED'
      logger.error({ msg: 'Process pipeline failed', jobId: id, code, error: message })
      return reply.status(500).send({ error: message, code })
    }
  })

  app.post('/jobs/:id/upload', async (request, reply) => {
    const { id } = request.params as { id: string }
    const finalStatus = await runUpload(id)
    return reply.send({ success: true, jobId: id, finalStatus })
  })

  app.post('/jobs/:id/verify', async (request, reply) => {
    const { id } = request.params as { id: string }

    try {
      await verifyJob(id)
      const job = await getJobById(id)
      if (!job) {
        return reply.status(404).send({ error: 'Job not found' })
      }

      const retryScheduled =
        job.status === 'ready_to_upload' &&
        (job.youtube_upload_status === 'retry_scheduled' ||
          job.instagram_upload_status === 'retry_scheduled')

      return reply.send({
        success: true,
        jobId: id,
        finalStatus: job.status,
        completed: job.status === 'completed',
        needsManualReview: job.status === 'needs_manual_review',
        retryScheduled,
      })
    } catch (err: unknown) {
      if (err instanceof ProjectApiError) {
        const status = err.code === 'JOB_NOT_FOUND' ? 404 : 400
        return reply.status(status).send({ error: err.message, code: err.code })
      }
      const message = err instanceof Error ? err.message : String(err)
      logger.error({ msg: 'Verify job failed', jobId: id, error: message })
      return reply.status(500).send({ error: message })
    }
  })

  app.post('/jobs/:id/retry-upload', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { platform } = (request.body as { platform?: 'youtube' | 'instagram' }) ?? 'both'

    try {
      await retryJob(id, platform)
      return reply.send({ success: true, jobId: id })
    } catch (err: unknown) {
      if (err instanceof ProjectApiError) {
        const status = err.code === 'JOB_NOT_FOUND' ? 404 : 400
        return reply.status(status).send({ error: err.message, code: err.code })
      }
      const message = err instanceof Error ? err.message : String(err)
      logger.error({ msg: 'Retry upload failed', jobId: id, error: message })
      return reply.status(500).send({ error: message })
    }
  })

  app.post('/jobs/:id/delete-drive-file', async (request, reply) => {
    const { id } = request.params as { id: string }
    const driveStorage = createDriveStorage()

    try {
      const result = await deleteJobDriveFile(id, driveStorage)
      return reply.send({ success: true, jobId: id, driveFileId: result.driveFileId })
    } catch (err: unknown) {
      if (err instanceof ProjectApiError) {
        const status = err.code === 'JOB_NOT_FOUND' ? 404 : 400
        return reply.status(status).send({ error: err.message, code: err.code })
      }
      const message = err instanceof Error ? err.message : String(err)
      return reply.status(500).send({ error: message })
    }
  })

  app.post('/jobs/:id/cleanup', async (request, reply) => {
    const { id } = request.params as { id: string }

    try {
      const result = await cleanupJob(id)
      return reply.send({ success: true, jobId: id, driveFileId: result.driveFileId })
    } catch (err: unknown) {
      if (err instanceof ProjectApiError) {
        const status = err.code === 'JOB_NOT_FOUND' ? 404 : 400
        return reply.status(status).send({ error: err.message, code: err.code })
      }
      const message = err instanceof Error ? err.message : String(err)
      return reply.status(500).send({ error: message })
    }
  })
}

export { WORKER_ID }
