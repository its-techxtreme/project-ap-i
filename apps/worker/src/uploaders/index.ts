import { UploadCoordinator } from './UploadCoordinator'
import { createInstagramUploader, createYoutubeUploader } from './uploaderFactory'

export function createUploadCoordinator(): UploadCoordinator {
  return new UploadCoordinator(createYoutubeUploader(), createInstagramUploader())
}

export { MockUploader } from './MockUploader'
export { UploadCoordinator } from './UploadCoordinator'
export { SessionHealthChecker } from './SessionHealthChecker'
export { YoutubePlaywrightUploader } from './YoutubePlaywrightUploader'
export { InstagramPlaywrightUploader } from './InstagramPlaywrightUploader'
export { createInstagramUploader, createYoutubeUploader } from './uploaderFactory'
export { resolveNicheAccounts } from './accountResolver'
export type {
  PlatformUploader,
  ResolvedAccounts,
  SessionHealth,
  UploadInput,
  UploadJobInput,
  UploadResult,
} from './types'
