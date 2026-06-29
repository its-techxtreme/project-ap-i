/**
 * Main job lifecycle statuses.
 * These map directly to the jobs.status column in Supabase.
 */
export const JOB_STATUSES = [
  'queued',
  'locked',
  'validating',
  'downloading',
  'downloaded',
  'processing',
  'processed',
  'staging_to_drive',
  'ready_to_upload',
  'uploading',
  'awaiting_verification',
  'completed',
  'failed',
  'needs_manual_review',
  'ignored',
] as const

export type JobStatus = (typeof JOB_STATUSES)[number]

/**
 * Sub-statuses for individual pipeline stages.
 */
export const STAGE_STATUSES = ['pending', 'running', 'succeeded', 'failed'] as const
export type StageStatus = (typeof STAGE_STATUSES)[number]

/**
 * Per-platform upload statuses.
 * These map to jobs.youtube_upload_status and jobs.instagram_upload_status.
 */
export const UPLOAD_STATUSES = [
  'pending',
  'uploading',
  'uploaded',
  'verification_pending',
  'verified',
  'failed',
  'skipped',
  'login_required',
  'retry_scheduled',
] as const

export type UploadStatus = (typeof UPLOAD_STATUSES)[number]

/**
 * Upload attempt record statuses.
 */
export const ATTEMPT_STATUSES = [
  'started',
  'uploaded',
  'verified',
  'failed',
  'login_required',
  'uncertain',
] as const

export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number]

/**
 * Platform account health statuses.
 */
export const ACCOUNT_STATUSES = [
  'active',
  'paused',
  'login_required',
  'failing',
  'disabled',
] as const

export type AccountStatus = (typeof ACCOUNT_STATUSES)[number]

/**
 * Google Drive file states tracked in jobs table.
 */
export const DRIVE_FOLDER_STATES = [
  'processed_ready',
  'failed_manual_review',
  'deleted',
  'unknown',
] as const

export type DriveFolderState = (typeof DRIVE_FOLDER_STATES)[number]
