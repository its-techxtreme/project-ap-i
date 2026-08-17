export type CollectorSnapshot = {
  lastAt: string | null
  lastQueued: number
  lastPendingNiche: number
  lastDuplicate: number
  lastInvalid: number
  loginRequired: boolean
  lastError: string | null
  running: boolean
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
}

export function getCollectorSnapshot(): CollectorSnapshot {
  return { ...collectorSnapshot }
}
