export interface UploadInput {
  jobId: string
  nicheSlug: string
  driveFileId: string
  driveViewUrl?: string
  localFilePath?: string
  platform: 'youtube' | 'instagram'
  account: {
    id: string
    accountLabel: string
    browserProfilePath?: string
    usernameHint?: string
  }
  metadata: {
    youtubeTitle?: string
    youtubeDescription?: string
    instagramCaption?: string
  }
}

export interface UploadResult {
  success: boolean
  platformMediaId?: string
  platformUrl?: string
  errorCode?: string
  errorMessage?: string
  loginRequired?: boolean
}

export interface SessionHealth {
  healthy: boolean
  reason?: string
  loginRequired?: boolean
}

export interface PlatformUploader {
  checkSession(accountId: string, profilePath?: string): Promise<SessionHealth>
  upload(input: UploadInput): Promise<UploadResult>
}

export interface ResolvedAccounts {
  youtube: { id: string; accountLabel: string; browserProfilePath?: string }
  instagram: { id: string; accountLabel: string; browserProfilePath?: string }
}

export interface UploadJobInput {
  id: string
  nicheId: string
  nicheSlug: string
  driveFileId: string
  driveViewUrl?: string
  youtubeTitle?: string
  youtubeDescription?: string
  instagramCaption?: string
  youtubeRetryCount: number
  instagramRetryCount: number
  localFilePath?: string
  /** When set, only upload these platforms (skips others). Used for targeted retries. */
  platformsToUpload?: Array<'youtube' | 'instagram'>
}
