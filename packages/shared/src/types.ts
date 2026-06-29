import type { NicheSlug, Platform } from './constants'
import type { AccountStatus, DriveFolderState, JobStatus, UploadStatus } from './statuses'

export interface Niche {
  id: string
  slug: NicheSlug
  label: string
  isActive: boolean
}

export interface PlatformAccount {
  id: string
  nicheId: string
  platform: Platform
  accountLabel: string
  usernameHint?: string
  browserProfilePath?: string
  status: AccountStatus
  loginRequired: boolean
  failureCount: number
  lastSuccessfulUploadAt?: string
}

export interface Job {
  id: string
  publicJobCode?: string
  submittedBy?: string
  sourceUrl: string
  normalizedSourceUrl?: string
  sourcePlatform: Platform
  nicheId: string
  rightsConfirmed: true

  status: JobStatus
  downloadStatus: string
  processingStatus: string
  metadataStatus: string
  youtubeUploadStatus: UploadStatus
  instagramUploadStatus: UploadStatus
  verificationStatus: string

  targetYoutubeAccountId?: string
  targetInstagramAccountId?: string

  driveFileId?: string
  driveFileName?: string
  driveViewUrl?: string
  driveFolderState?: DriveFolderState
  driveDeletedAt?: string

  youtubeTitle?: string
  youtubeDescription?: string
  instagramCaption?: string

  retryCount: number
  youtubeRetryCount: number
  instagramRetryCount: number
  failureCode?: string
  failureReason?: string

  lockedBy?: string
  lockedAt?: string
  lockExpiresAt?: string
  verificationDueAt?: string

  createdAt: string
  updatedAt: string
  processedAt?: string
  uploadedAt?: string
  completedAt?: string
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
}
