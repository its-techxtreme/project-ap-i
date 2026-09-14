import path from 'node:path'

import { logger } from '../logging/logger'

type QueueTail = Promise<unknown>

const profileQueues = new Map<string, QueueTail>()

function normalizeProfileKey(profilePath: string): string {
  return path.resolve(profilePath).toLowerCase()
}

/** One Chrome at a time per profile folder. Two launches share the dir and you get Opening in existing session. */
export async function withPlaywrightProfileLock<T>(
  profilePath: string,
  fn: () => Promise<T>,
): Promise<T> {
  const key = normalizeProfileKey(profilePath)
  const previous = profileQueues.get(key) ?? Promise.resolve()

  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })

  const tail = previous.then(() => gate)
  profileQueues.set(key, tail.catch(() => undefined))

  await previous.catch(() => undefined)

  logger.debug({ msg: 'Acquired Playwright profile lock', profilePath: key })
  try {
    return await fn()
  } finally {
    release()
    logger.debug({ msg: 'Released Playwright profile lock', profilePath: key })
    if (profileQueues.get(key) === tail) {
      // Allow GC of settled chains when idle
      void tail.finally(() => {
        if (profileQueues.get(key) === tail) profileQueues.delete(key)
      })
    }
  }
}

export function isPlaywrightProfileBusyError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /Opening in existing browser session|user data directory is already in use|profile.*(busy|in use)|SingletonLock/i.test(
    message,
  )
}

/** Test helper — clears in-memory queues between unit tests. */
export function resetPlaywrightProfileLocksForTests(): void {
  profileQueues.clear()
}
