/**
 * Typed error codes used across the pipeline.
 * Both worker and frontend reference these for structured error handling.
 */
export const ERROR_CODES = {
  // URL validation
  INVALID_URL: 'INVALID_URL',
  UNSUPPORTED_DOMAIN: 'UNSUPPORTED_DOMAIN',

  // Download stage
  DOWNLOAD_FAILED: 'DOWNLOAD_FAILED',
  DOWNLOAD_TIMEOUT: 'DOWNLOAD_TIMEOUT',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  DURATION_TOO_LONG: 'DURATION_TOO_LONG',

  // Processing stage
  FFMPEG_FAILED: 'FFMPEG_FAILED',
  /** @deprecated Watermarking removed from the edit preset — kept for older logs. */
  WATERMARK_MISSING: 'WATERMARK_MISSING',
  BACKGROUND_MUSIC_MISSING: 'BACKGROUND_MUSIC_MISSING',

  // Drive stage
  DRIVE_UPLOAD_FAILED: 'DRIVE_UPLOAD_FAILED',
  /** Refresh token expired/revoked or service account credentials invalid. */
  DRIVE_AUTH_FAILED: 'DRIVE_AUTH_FAILED',
  DRIVE_DELETE_FAILED: 'DRIVE_DELETE_FAILED',
  DRIVE_FILE_MISSING: 'DRIVE_FILE_MISSING',

  // Metadata stage
  AI_METADATA_FAILED: 'AI_METADATA_FAILED',

  // Upload stage
  YOUTUBE_UPLOAD_FAILED: 'YOUTUBE_UPLOAD_FAILED',
  YOUTUBE_URL_CAPTURE_FAILED: 'YOUTUBE_URL_CAPTURE_FAILED',
  PIPELINE_STALE: 'PIPELINE_STALE',
  JOB_ABORTED: 'JOB_ABORTED',
  YOUTUBE_LOGIN_REQUIRED: 'YOUTUBE_LOGIN_REQUIRED',
  INSTAGRAM_UPLOAD_FAILED: 'INSTAGRAM_UPLOAD_FAILED',
  INSTAGRAM_LOGIN_REQUIRED: 'INSTAGRAM_LOGIN_REQUIRED',
  /** Soft defer — account hit daily upload cap; job stays queued / ready_to_upload. */
  DAILY_UPLOAD_LIMIT_REACHED: 'DAILY_UPLOAD_LIMIT_REACHED',

  // Verification
  VERIFICATION_FAILED: 'VERIFICATION_FAILED',

  // Account mapping
  NICHE_ACCOUNT_MAPPING_INVALID: 'NICHE_ACCOUNT_MAPPING_INVALID',
  NICHE_ACCOUNT_NOT_FOUND: 'NICHE_ACCOUNT_NOT_FOUND',

  // Worker
  JOB_NOT_FOUND: 'JOB_NOT_FOUND',
  JOB_ALREADY_LOCKED: 'JOB_ALREADY_LOCKED',
  RESOURCE_LIMIT_WAIT: 'RESOURCE_LIMIT_WAIT',
  UNAUTHORIZED: 'UNAUTHORIZED',
} as const

export type ErrorCode = keyof typeof ERROR_CODES

export class ProjectApiError extends Error {
  public readonly code: ErrorCode
  public readonly retryable: boolean
  public readonly stage?: string

  constructor(code: ErrorCode, message: string, options?: { retryable?: boolean; stage?: string }) {
    super(message)
    this.name = 'ProjectApiError'
    this.code = code
    this.retryable = options?.retryable ?? false
    this.stage = options?.stage
  }
}
