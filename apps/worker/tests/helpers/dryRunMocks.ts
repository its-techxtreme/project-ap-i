import { MockDriveStorage } from '../../src/storage/MockDriveStorage'

import { createSupabaseAdminMock, InMemorySupabase } from './inMemorySupabase'
import type { DryRunOrchestrator } from './dryRunOrchestrator'

export const dryRunDb = new InMemorySupabase()
export const dryRunDriveStorage = new MockDriveStorage()
export let dryRunOrchestrator: DryRunOrchestrator | undefined

export const dryRunSupabaseAdmin = createSupabaseAdminMock(dryRunDb)

export function resetDryRunState(): void {
  dryRunDb.reset()
  dryRunDriveStorage.getStoredFiles().clear()
  dryRunOrchestrator = undefined
}

export function setDryRunOrchestrator(orchestrator: DryRunOrchestrator): void {
  dryRunOrchestrator = orchestrator
}
