import { config } from '../config'
import { supabaseAdmin } from '../db/supabaseAdmin'
import { logger } from '../logging/logger'
import { probeDriveAuth } from '../storage/driveAuth'

import { pullCollectorControl } from '../collector/collectorControl'
import { collectorSnapshot, getCollectorSnapshot } from '../collector/collectorState'
import { buildChartSettingsSnapshot } from './chartSettings'

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
  collector?: {
    lastAt: string | null
    lastQueued: number
    lastPendingNiche: number
    loginRequired: boolean
    running: boolean
    armed?: boolean
    runsToday?: number
    profile?: string
  }
}

async function syncChartSettings(): Promise<void> {
  const snapshot = buildChartSettingsSnapshot()
  const now = new Date().toISOString()
  const rows = Object.entries(snapshot).map(([key, value]) => ({
    key,
    value,
    updated_at: now,
  }))

  const { error } = await supabaseAdmin.from('system_settings').upsert(rows, {
    onConflict: 'key',
  })

  if (error) {
    throw new Error(`chart settings sync failed: ${error.message}`)
  }
}

async function writeHeartbeat(ok: boolean, driveOk: boolean): Promise<void> {
  try {
    const control = await pullCollectorControl()
    if (!control.unavailable) {
      collectorSnapshot.armed = control.armed
      collectorSnapshot.runsToday = control.daily.runs.length
      collectorSnapshot.loginRequired = control.loginRequired === true
    }
  } catch (err) {
    logger.warn({
      msg: 'Collector control refresh failed',
      err: err instanceof Error ? err.message : String(err),
    })
  }

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
    collector: {
      ...getCollectorSnapshot(),
      profile: config.COLLECTOR_PROFILE,
    },
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

/** Ping system_settings so hosted admin can show laptop online without hitting the private worker URL. Also copies chart ops keys from live config. */
export function startWorkerHeartbeat(): () => void {
  if (config.NODE_ENV === 'test') {
    return () => undefined
  }

  let stopped = false

  const tick = async () => {
    if (stopped) return
    try {
      const drive = await probeDriveAuth()
      const ok = drive.ok
      await writeHeartbeat(ok, drive.ok)
      await syncChartSettings()
      logger.info({
        msg: 'Worker heartbeat written',
        ok,
        driveOk: drive.ok,
        key: WORKER_HEARTBEAT_KEY,
        chartSettingsSynced: true,
      })
    } catch (err) {
      logger.warn({
        msg: 'Worker heartbeat failed',
        err: err instanceof Error ? err.message : String(err),
      })
    }
  }

  void tick()
  const timer = setInterval(() => {
    void tick()
  }, WORKER_HEARTBEAT_INTERVAL_MS)

  return () => {
    stopped = true
    clearInterval(timer)
  }
}
