import { config } from '../config'
import { supabaseAdmin } from '../db/supabaseAdmin'
import { logger } from '../logging/logger'
import { probeDriveAuth } from '../storage/driveAuth'

export const WORKER_HEARTBEAT_KEY = 'worker_heartbeat'
export const WORKER_HEARTBEAT_INTERVAL_MS = 20_000

export type WorkerHeartbeatValue = {
  at: string
  ok: boolean
  version: string
  env: string
  realUploadsEnabled: boolean
  youtubeUploadsEnabled: boolean
  instagramUploadsEnabled: boolean
  driveOk: boolean
  host: string
}

async function writeHeartbeat(ok: boolean, driveOk: boolean): Promise<void> {
  const value: WorkerHeartbeatValue = {
    at: new Date().toISOString(),
    ok,
    version: '0.1.0',
    env: config.NODE_ENV,
    realUploadsEnabled: config.REAL_UPLOADS_ENABLED,
    youtubeUploadsEnabled: config.YOUTUBE_UPLOADS_ENABLED,
    instagramUploadsEnabled: config.INSTAGRAM_UPLOADS_ENABLED,
    driveOk,
    host: process.env.COMPUTERNAME || process.env.HOSTNAME || 'worker',
  }

  const { error } = await supabaseAdmin.from('system_settings').upsert(
    {
      key: WORKER_HEARTBEAT_KEY,
      value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  )

  if (error) {
    throw new Error(error.message)
  }
}

/**
 * Periodically upserts laptop presence into system_settings so the hosted
 * admin dashboard can show Remote Laptop online/offline without reaching
 * the private worker URL from the browser.
 */
export function startWorkerHeartbeat(): () => void {
  if (config.NODE_ENV === 'test') {
    return () => undefined
  }

  let stopped = false
  let timer: ReturnType<typeof setInterval> | undefined

  const tick = async () => {
    if (stopped) return
    try {
      const drive = await probeDriveAuth()
      const ok = drive.ok
      await writeHeartbeat(ok, drive.ok)
      logger.info({
        msg: 'Worker heartbeat written',
        ok,
        driveOk: drive.ok,
        key: WORKER_HEARTBEAT_KEY,
      })
    } catch (err) {
      logger.warn({
        msg: 'Worker heartbeat failed',
        err: err instanceof Error ? err.message : String(err),
      })
    }
  }

  void tick()
  timer = setInterval(() => {
    void tick()
  }, WORKER_HEARTBEAT_INTERVAL_MS)

  return () => {
    stopped = true
    if (timer) clearInterval(timer)
  }
}
