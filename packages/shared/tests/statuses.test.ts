import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_STATUSES,
  ATTEMPT_STATUSES,
  DRIVE_FOLDER_STATES,
  JOB_STATUSES,
  STAGE_STATUSES,
  UPLOAD_STATUSES,
} from '../src/statuses'

describe('statuses', () => {
  it('JOB_STATUSES includes queued, completed, needs_manual_review, failed', () => {
    expect(JOB_STATUSES).toContain('queued')
    expect(JOB_STATUSES).toContain('completed')
    expect(JOB_STATUSES).toContain('needs_manual_review')
    expect(JOB_STATUSES).toContain('failed')
  })

  it('JOB_STATUSES matches database design recommended values', () => {
    expect([...JOB_STATUSES]).toEqual([
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
    ])
  })

  it('UPLOAD_STATUSES includes login_required and verified', () => {
    expect(UPLOAD_STATUSES).toContain('login_required')
    expect(UPLOAD_STATUSES).toContain('verified')
  })

  it('UPLOAD_STATUSES includes full per-platform lifecycle set', () => {
    expect([...UPLOAD_STATUSES]).toEqual([
      'pending',
      'uploading',
      'uploaded',
      'verification_pending',
      'verified',
      'failed',
      'skipped',
      'login_required',
      'retry_scheduled',
    ])
  })

  it('ATTEMPT_STATUSES matches upload_attempts table values', () => {
    expect([...ATTEMPT_STATUSES]).toEqual([
      'started',
      'uploaded',
      'verified',
      'failed',
      'login_required',
      'uncertain',
    ])
  })

  it('STAGE_STATUSES includes pending, running, succeeded, failed', () => {
    expect([...STAGE_STATUSES]).toEqual(['pending', 'running', 'succeeded', 'failed'])
  })

  it('ACCOUNT_STATUSES includes login_required', () => {
    expect(ACCOUNT_STATUSES).toContain('login_required')
  })

  it('DRIVE_FOLDER_STATES includes processed_ready and deleted', () => {
    expect(DRIVE_FOLDER_STATES).toContain('processed_ready')
    expect(DRIVE_FOLDER_STATES).toContain('deleted')
  })
})
