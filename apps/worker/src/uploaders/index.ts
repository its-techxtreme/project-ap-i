import { MockUploader } from './MockUploader'
import { UploadCoordinator } from './UploadCoordinator'

export function createUploadCoordinator(): UploadCoordinator {
  const uploader = new MockUploader()
  return new UploadCoordinator(uploader, uploader)
}

export { MockUploader } from './MockUploader'
export { UploadCoordinator } from './UploadCoordinator'
export { resolveNicheAccounts } from './accountResolver'
export type {
  PlatformUploader,
  ResolvedAccounts,
  SessionHealth,
  UploadInput,
  UploadJobInput,
  UploadResult,
} from './types'
