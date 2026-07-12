import {
  claimNextAdminCommand,
  markAdminCommandDone,
  markAdminCommandFailed,
  type DbAdminCommandRow,
} from '../db/adminCommandsRepo'
import { writeJobEvent } from '../db/jobsRepo'
import { logger } from '../logging/logger'
import { createDriveStorage } from '../storage'

import { deleteJobDriveFile } from './driveDelete'
import { recoverStaleUploadingJobs } from './recoverStaleUploads'
import { retryJob } from './retryJob'

export interface ProcessAdminCommandResult {
  processed: boolean
  commandId?: string
  jobId?: string
  command?: string
  success?: boolean
  error?: string
}

function platformFromPayload(
  payload: Record<string, unknown>,
): 'youtube' | 'instagram' | undefined {
  const platform = payload.platform
  if (platform === 'youtube' || platform === 'instagram') return platform
  return undefined
}

async function executeCommand(cmd: DbAdminCommandRow): Promise<void> {
  if (cmd.command === 'retry_upload') {
    await retryJob(cmd.job_id, platformFromPayload(cmd.payload))
    await writeJobEvent(
      cmd.job_id,
      'admin',
      'admin_retry_executed',
      `Admin command ${cmd.id} executed retry_upload`,
      'info',
      { commandId: cmd.id },
    )
    return
  }

  if (cmd.command === 'delete_drive_file') {
    const driveStorage = createDriveStorage()
    await deleteJobDriveFile(cmd.job_id, driveStorage)
    await writeJobEvent(
      cmd.job_id,
      'admin',
      'admin_drive_delete_executed',
      `Admin command ${cmd.id} executed delete_drive_file`,
      'info',
      { commandId: cmd.id },
    )
    return
  }

  throw new Error(`Unknown admin command: ${String(cmd.command)}`)
}

/** Claims at most one pending admin command and executes it against the local worker. */
export async function processNextAdminCommand(workerId: string): Promise<ProcessAdminCommandResult> {
  try {
    await recoverStaleUploadingJobs(workerId)
  } catch (err) {
    logger.warn({ msg: 'Stale upload recovery failed before admin command', workerId, err: String(err) })
  }

  const cmd = await claimNextAdminCommand(workerId)
  if (!cmd) {
    return { processed: false }
  }

  logger.info({
    msg: 'Admin command claimed',
    commandId: cmd.id,
    jobId: cmd.job_id,
    command: cmd.command,
    workerId,
  })

  try {
    await executeCommand(cmd)
    await markAdminCommandDone(cmd.id)
    logger.info({
      msg: 'Admin command completed',
      commandId: cmd.id,
      jobId: cmd.job_id,
      command: cmd.command,
    })
    return {
      processed: true,
      commandId: cmd.id,
      jobId: cmd.job_id,
      command: cmd.command,
      success: true,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    await markAdminCommandFailed(cmd.id, message)
    logger.error({
      msg: 'Admin command failed',
      commandId: cmd.id,
      jobId: cmd.job_id,
      command: cmd.command,
      error: message,
    })
    return {
      processed: true,
      commandId: cmd.id,
      jobId: cmd.job_id,
      command: cmd.command,
      success: false,
      error: message,
    }
  }
}
