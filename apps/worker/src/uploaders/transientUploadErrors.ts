/**
 * Detect transient Playwright upload failures that should be retried in-process
 * before burning a job-level retry / needs_manual_review.
 */
export function isTransientUploadFailure(result: {
  success: boolean
  loginRequired?: boolean
  errorCode?: string
  errorMessage?: string
}): boolean {
  if (result.success || result.loginRequired) return false
  if (result.errorCode === 'PROFILE_BUSY') return true

  const msg = (result.errorMessage ?? '').toLowerCase()
  return (
    msg.includes('opening in existing browser session') ||
    msg.includes('profile is already in use') ||
    msg.includes('user data directory is already in use') ||
    msg.includes('did not expose a file input') ||
    msg.includes('create dialog') ||
    msg.includes('share-confirmation toast') ||
    msg.includes('share confirmation') ||
    msg.includes('no video url was captured')
  )
}
