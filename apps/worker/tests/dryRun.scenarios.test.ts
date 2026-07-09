import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  dryRunDb,
  dryRunDriveStorage,
  dryRunOrchestrator,
  dryRunSupabaseAdmin,
  resetDryRunState,
  setDryRunOrchestrator,
} from './helpers/dryRunMocks'
import type { DryRunOrchestrator } from './helpers/dryRunOrchestrator'
import type { DryRunNicheSlug } from './helpers/inMemorySupabase'

vi.mock('../src/db/supabaseAdmin', () => ({
  supabaseAdmin: dryRunSupabaseAdmin,
}))

vi.mock('../src/storage', () => ({
  createDriveStorage: () => dryRunDriveStorage,
}))

vi.mock('../src/uploaders', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/uploaders')>()
  const { UploadCoordinator } = await import('../src/uploaders/UploadCoordinator')
  return {
    ...original,
    createUploadCoordinator: () => {
      if (!dryRunOrchestrator) {
        return original.createUploadCoordinator()
      }
      return new UploadCoordinator(
        dryRunOrchestrator.getYoutubeUploader(),
        dryRunOrchestrator.getInstagramUploader(),
      )
    },
  }
})

describe('Phase 14 dry run — worker pipeline scenarios', () => {
  let orchestrator: DryRunOrchestrator

  beforeEach(async () => {
    resetDryRunState()
    const { DryRunOrchestrator } = await import('./helpers/dryRunOrchestrator')
    orchestrator = new DryRunOrchestrator(dryRunDb, dryRunDriveStorage)
    setDryRunOrchestrator(orchestrator)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  async function assertHappyPathForNiche(nicheSlug: DryRunNicheSlug): Promise<void> {
    const jobId = await orchestrator.runHappyPath(nicheSlug)
    const job = orchestrator.getJobState(jobId)

    expect(job?.status).toBe('completed')
    expect(job?.niche_id).toBe(orchestrator.nicheIdFor(nicheSlug))
    expect(job?.youtube_upload_status).toBe('verified')
    expect(job?.instagram_upload_status).toBe('verified')
    expect(job?.drive_folder_state).toBe('deleted')
    expect(job?.drive_deleted_at).toBeTruthy()
    expect(job?.youtube_title).toBeTruthy()
    expect(job?.instagram_caption).toBeTruthy()

    const stages = orchestrator.getEvents(jobId).map((event) => event.stage)
    expect(stages).toEqual(
      expect.arrayContaining(['download', 'process', 'staging_to_drive', 'metadata', 'upload', 'verify', 'cleanup']),
    )

    const attempts = orchestrator.getUploadAttempts(jobId)
    expect(attempts.filter((a) => a.platform === 'youtube' && a.status === 'uploaded').length).toBeGreaterThan(0)
    expect(attempts.filter((a) => a.platform === 'instagram' && a.status === 'uploaded').length).toBeGreaterThan(0)

    expect(orchestrator.getAuditLogs(jobId).some((log) => log.action === 'job_verified')).toBe(true)
    expect(orchestrator.getAuditLogs(jobId).some((log) => log.action === 'drive_deleted')).toBe(true)

    orchestrator.assertMockUploadsOnly()
    orchestrator.assertNoSecretsInRecords()
  }

  it('Scenario 1: Memes — happy path completes with mock pipeline', async () => {
    await assertHappyPathForNiche('memes')
  })

  it('Scenario 2: Anime — happy path completes with mock pipeline', async () => {
    await assertHappyPathForNiche('anime')
  })

  it('Scenario 3: Sports — happy path completes with mock pipeline', async () => {
    await assertHappyPathForNiche('sports')
  })

  it('Scenario 4: YouTube upload failure on first attempt then retry succeeds', async () => {
    orchestrator.configureUploaders({ failFirstAttempts: { youtube: 1 } })

    const jobId = orchestrator.submitJob('memes')
    await orchestrator.claim()
    await orchestrator.runProcess(jobId)

    const uploadStatus = await orchestrator.runUpload(jobId)
    expect(uploadStatus).toBe('awaiting_verification')

    let job = orchestrator.getJobState(jobId)!
    expect(job.youtube_upload_status).toBe('failed')
    expect(job.instagram_upload_status).toBe('uploaded')
    expect(job.youtube_retry_count).toBe(0)

    await orchestrator.runVerify(jobId)
    job = orchestrator.getJobState(jobId)!
    expect(job.status).toBe('ready_to_upload')
    expect(job.youtube_retry_count).toBe(1)
    expect(job.youtube_upload_status).toBe('retry_scheduled')

    orchestrator.configureUploaders({})
    await orchestrator.runRetryUpload(jobId, 'youtube')

    job = orchestrator.getJobState(jobId)!
    expect(job.youtube_upload_status).toBe('uploaded')
    expect(job.instagram_upload_status).toBe('uploaded')

    await orchestrator.runVerify(jobId)
    job = orchestrator.getJobState(jobId)!
    expect(job.status).toBe('completed')
    expect(job.drive_folder_state).toBe('deleted')

    orchestrator.assertMockUploadsOnly()
    orchestrator.assertNoSecretsInRecords()
  })

  it('Scenario 5: both uploads fail twice → needs_manual_review, Drive file retained', async () => {
    orchestrator.configureUploaders({ alwaysFail: ['youtube', 'instagram'] })

    const jobId = orchestrator.submitJob('anime')
    await orchestrator.claim()
    await orchestrator.runProcess(jobId)
    await orchestrator.runUpload(jobId)

    let job = orchestrator.getJobState(jobId)!
    expect(job.youtube_upload_status).toBe('failed')
    expect(job.instagram_upload_status).toBe('failed')

    await orchestrator.runVerify(jobId)
    job = orchestrator.getJobState(jobId)!
    expect(job.status).toBe('ready_to_upload')
    expect(job.youtube_retry_count).toBe(1)
    expect(job.instagram_retry_count).toBe(1)

    await orchestrator.runRetryUpload(jobId)
    await orchestrator.runVerify(jobId)

    job = orchestrator.getJobState(jobId)!
    expect(job.status).toBe('needs_manual_review')
    expect(job.youtube_retry_count).toBe(2)
    expect(job.instagram_retry_count).toBe(2)
    expect(job.drive_folder_state).toBe('processed_ready')
    expect(job.drive_deleted_at).toBeFalsy()
    expect(dryRunDriveStorage.getStoredFiles().has(job.drive_file_id as string)).toBe(true)

    orchestrator.assertMockUploadsOnly()
    orchestrator.assertNoSecretsInRecords()
  })

  it('Scenario 6: admin deletes failed Drive file from needs_manual_review job', async () => {
    orchestrator.configureUploaders({ alwaysFail: ['youtube', 'instagram'] })

    const jobId = orchestrator.submitJob('anime')
    await orchestrator.claim()
    await orchestrator.runProcess(jobId)
    await orchestrator.runUpload(jobId)
    await orchestrator.runVerify(jobId)
    await orchestrator.runRetryUpload(jobId)
    await orchestrator.runVerify(jobId)

    const beforeDelete = orchestrator.getJobState(jobId)!
    expect(beforeDelete.status).toBe('needs_manual_review')
    expect(beforeDelete.drive_file_id).toBeTruthy()

    await orchestrator.adminDeleteDrive(jobId)

    const afterDelete = orchestrator.getJobState(jobId)!
    expect(afterDelete.drive_folder_state).toBe('deleted')
    expect(afterDelete.drive_deleted_at).toBeTruthy()
    expect(afterDelete.status).toBe('needs_manual_review')
    expect(orchestrator.getAuditLogs(jobId).some((log) => log.action === 'drive_deleted')).toBe(true)
    expect(dryRunDriveStorage.getStoredFiles().has(beforeDelete.drive_file_id as string)).toBe(false)
  })

  it('REAL_UPLOADS_ENABLED is false during dry run tests', async () => {
    const { config } = await import('../src/config')
    expect(config.REAL_UPLOADS_ENABLED).toBe(false)
  })
})
