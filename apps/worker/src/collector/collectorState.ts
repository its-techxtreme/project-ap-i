export type CollectorSnapshot = {
  lastAt: string | null
  lastQueued: number
  lastPendingNiche: number
  lastDuplicate: number
  lastInvalid: number
  loginRequired: boolean
  lastError: string | null
  running: boolean
  armed: boolean
  runsToday: number
}

export const collectorSnapshot: CollectorSnapshot = {
  lastAt: null,
  lastQueued: 0,
  lastPendingNiche: 0,
  lastDuplicate: 0,
  lastInvalid: 0,
  loginRequired: false,
  lastError: null,
  running: false,
  armed: true,
  runsToday: 0,
}

export function getCollectorSnapshot(): CollectorSnapshot {
  return { ...collectorSnapshot }
}
