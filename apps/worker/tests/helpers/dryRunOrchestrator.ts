import fs from 'node:fs/promises'
import path from 'node:path'

import { vi } from 'vitest'

import { MockMetadataProvider } from '../../src/metadata/MockMetadataProvider'
import type { MockDriveStorage } from '../../src/storage/MockDriveStorage'
import { UploadCoordinator } from '../../src/uploaders/UploadCoordinator'

import { ConfigurableMockUploader, type UploaderFailureConfig } from './configurableMockUploader'
import { finalizeUploadStatus } from '../../src/jobs/uploadFinalize'
import { DRY_RUN_NICHES, type InMemorySupabase, type DryRunNicheSlug } from './inMemorySupabase'

const FIXTURE_MP4 = path.join(__dirname, '../fixtures/sample.mp4')

export class DryRunOrchestrator {
  private youtubeUploader = new ConfigurableMockUploader()
  private instagramUploader = new ConfigurableMockUploader()

  constructor(
    readonly db: InMemorySupabase,
    readonly driveStorage: MockDriveStorage,
    readonly metadataProvider = new MockMetadataProvider(),
  ) {}

  getYoutubeUploader(): ConfigurableMockUploader {
    return this.youtubeUploader
  }

  getInstagramUploader(): ConfigurableMockUploader {
    return this.instagramUploader
  }

  configureUploaders(failureConfig: UploaderFailureConfig): void {
    this.youtubeUploader = new ConfigurableMockUploader(failureConfig)
    this.instagramUploader = new ConfigurableMockUploader(failureConfig)
  }

  submitJob(nicheSlug: DryRunNicheSlug, sourceUrl?: string): string {
    const job = this.db.createQueuedJob({ nicheSlug, sourceUrl })
    return job.id as string
  }

  async claim(): Promise<string> {
    const { claimJob } = await import('../../src/jobs/claimJob')
    const job = await claimJob('dry-run-worker')
    if (!job) throw new Error('No queued job available to claim')
    return job.id
  }

  async runProcess(jobId: string): Promise<void> {
    const { getJobById, getNicheSlugById } = await import('../../src/db/jobsRepo')
    const { runProcessPipeline } = await import('../../src/jobs/processPipeline')

    const job = await getJobById(jobId)
    if (!job) throw new Error(`Job not found: ${jobId}`)

    const fixtureBuffer = await fs.readFile(FIXTURE_MP4)
    const tempDir = path.join(process.cwd(), 'tmp', 'dry-run', jobId)
    await fs.mkdir(tempDir, { recursive: true })
    const sourcePath = path.join(tempDir, 'source.mp4')
    const outputPath = path.join(tempDir, `job_${jobId}_edited.mp4`)
    await fs.copyFile(FIXTURE_MP4, sourcePath)
    await fs.copyFile(FIXTURE_MP4, outputPath)

    await runProcessPipeline(job, {
      downloader: {
        download: vi.fn().mockResolvedValue({ localPath: sourcePath, fileSize: fixtureBuffer.length }),
      },
      processor: {
        process: vi.fn().mockResolvedValue({ outputPath, fileSize: fixtureBuffer.length }),
      },
      driveStorage: this.driveStorage,
      metadataProvider: this.metadataProvider,
      tempFileManager: {
        createJobDir: vi.fn().mockResolvedValue(tempDir),
        cleanupJobDir: vi.fn().mockResolvedValue(undefined),
        getOutputPath: vi.fn().mockReturnValue(outputPath),
      },
      getNicheSlug: (nicheId) => getNicheSlugById(nicheId),
    })
  }

  async runUpload(jobId: string): Promise<string> {
    const { getJobById, getNicheSlugById, updateJobStatus } = await import('../../src/db/jobsRepo')

    const job = await getJobById(jobId)
    if (!job) throw new Error(`Job not found: ${jobId}`)

    const nicheSlug = await getNicheSlugById(job.niche_id)
    if (!nicheSlug) throw new Error(`Niche not found: ${job.niche_id}`)

    await updateJobStatus(jobId, 'uploading', {
      youtube_upload_status: 'uploading',
      instagram_upload_status: 'uploading',
    })

    const coordinator = new UploadCoordinator(this.youtubeUploader, this.instagramUploader)
    await coordinator.uploadBothPlatforms({
      id: job.id,
      nicheId: job.niche_id,
      nicheSlug,
      driveFileId: job.drive_file_id!,
      driveViewUrl: job.drive_view_url ?? undefined,
      youtubeTitle: job.youtube_title ?? undefined,
      youtubeDescription: job.youtube_description ?? undefined,
      instagramCaption: job.instagram_caption ?? undefined,
      youtubeRetryCount: job.youtube_retry_count,
      instagramRetryCount: job.instagram_retry_count,
      platformsToUpload: ['youtube', 'instagram'],
    })

    const updated = await getJobById(jobId)
    if (!updated) throw new Error(`Job not found after upload: ${jobId}`)

    return finalizeUploadStatus(
      jobId,
      updated.youtube_upload_status,
      updated.instagram_upload_status,
    )
  }

  async runVerify(jobId: string): Promise<void> {
    const { verifyJob } = await import('../../src/jobs/verifyJob')
    await verifyJob(jobId)
  }

  async runRetryUpload(jobId: string, platform?: 'youtube' | 'instagram'): Promise<void> {
    const { retryJob } = await import('../../src/jobs/retryJob')
    await retryJob(jobId, platform)
  }

  async adminDeleteDrive(jobId: string): Promise<void> {
    const { deleteJobDriveFile } = await import('../../src/jobs/driveDelete')
    await deleteJobDriveFile(jobId, this.driveStorage)
  }

  async runHappyPath(nicheSlug: DryRunNicheSlug): Promise<string> {
    this.configureUploaders({})
    const jobId = this.submitJob(nicheSlug)
    await this.claim()
    await this.runProcess(jobId)
    await this.runUpload(jobId)
    await this.runVerify(jobId)
    return jobId
  }

  getJobState(jobId: string) {
    return this.db.getJob(jobId)
  }

  getEvents(jobId: string) {
    return this.db.tables.job_events.filter((event) => event.job_id === jobId)
  }

  getUploadAttempts(jobId: string) {
    return this.db.tables.upload_attempts.filter((attempt) => attempt.job_id === jobId)
  }

  getAuditLogs(jobId: string) {
    return this.db.tables.audit_logs.filter((log) => log.target_id === jobId)
  }

  assertMockUploadsOnly(): void {
    const allCalls = [...this.youtubeUploader.uploadCalls, ...this.instagramUploader.uploadCalls]
    if (allCalls.length === 0) {
      throw new Error('Expected mock upload calls but none were recorded')
    }
  }

  assertNoSecretsInRecords(): void {
    const secretPatterns = [/SUPABASE_SERVICE_ROLE_KEY/i, /WORKER_INTERNAL_TOKEN/i, /nvapi-/i]
    const serialized = JSON.stringify(this.db.tables)
    for (const pattern of secretPatterns) {
      if (pattern.test(serialized)) {
        throw new Error(`Secret-like value detected in dry run records: ${pattern}`)
      }
    }
  }

  nicheIdFor(slug: DryRunNicheSlug): string {
    return DRY_RUN_NICHES[slug].id
  }
}
