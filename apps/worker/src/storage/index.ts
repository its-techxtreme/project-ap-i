import { config } from '../config'

import { MockDriveStorage } from './MockDriveStorage'
import type { DriveStorage } from './types'

export function createDriveStorage(): DriveStorage {
  if (config.NODE_ENV === 'test' && !config.INTEGRATION_TESTS_ENABLED) {
    return new MockDriveStorage()
  }

  // Lazy load to avoid pulling googleapis into unit tests that import the worker server.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GoogleDriveStorage } = require('./GoogleDriveStorage') as typeof import('./GoogleDriveStorage')
  return new GoogleDriveStorage()
}

export { buildDriveFileName, formatDriveTimestamp } from './driveFileName'
export { MockDriveStorage } from './MockDriveStorage'
export type { DriveStorage, DriveUploadInput, DriveUploadOutput } from './types'
