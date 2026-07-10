import type { JobStatus } from '@project-api/shared'
import { ERROR_CODES, ProjectApiError } from '@project-api/shared'

import type { Downloader } from '../downloaders/types'
import type { DbJobRow } from '../db/jobsRepo'
import { getNicheSlugById, updateJobStatus, writeJobEvent } from '../db/jobsRepo'
import type { Processor } from '../processors/types'
import { resolveWatermarkPath } from '../processors/resolveWatermarkPath'
import type { MetadataProvider } from '../metadata/types'
import type { DriveStorage } from '../storage/types'

import { TempFileManager } from './TempFileManager'

const VALID_NICHE_SLUGS = ['memes', 'anime', 'sports'] as const
type ValidNicheSlug = (typeof VALID_NICHE_SLUGS)[number]

function isValidNicheSlug(slug: string): slug is ValidNicheSlug {
  return (VALID_NICHE_SLUGS as readonly string[]).includes(slug)
}

function stageFailureFields(stage: string | undefined): Record<string, string> {
  switch (stage) {
    case 'download':
      return { download_status: 'failed' }
    case 'processing':
      return { processing_status: 'failed' }
    case 'staging_to_drive':
      return {}
    default:
      return {}
  }
}

async function recordPipelineFailure(jobId: string, err: unknown): Promise<void> {
  const apiErr = err instanceof ProjectApiError ? err : null
  const stage = apiErr?.stage ?? 'processing'
  const failureCode =
    apiErr?.code ??
    (stage === 'download'
      ? ERROR_CODES.DOWNLOAD_FAILED
      : stage === 'staging_to_drive'
        ? ERROR_CODES.DRIVE_UPLOAD_FAILED
        : ERROR_CODES.FFMPEG_FAILED)
  const failureMessage = err instanceof Error ? err.message : String(err)

  await updateJobStatus(jobId, 'failed', {
    failure_code: failureCode,
    failure_reason: failureMessage,
    ...stageFailureFields(stage),
  })
  await writeJobEvent(jobId, stage, 'pipeline_failed', failureMessage, 'error', {
    code: failureCode,
    retryable: apiErr?.retryable ?? false,
  })
}

export interface ProcessPipelineDeps {
  downloader: Downloader
  processor: Processor
  driveStorage: DriveStorage
  metadataProvider: MetadataProvider
  tempFileManager: TempFileManager
  getNicheSlug: (nicheId: string) => Promise<string | null>
}

export async function createDefaultPipelineDeps(): Promise<ProcessPipelineDeps> {
  const [{ createDownloader }, { FfmpegProcessor }, { createDriveStorage }, { createMetadataProvider }] =
    await Promise.all([
      import('../downloaders'),
      import('../processors/FfmpegProcessor'),
      import('../storage'),
      import('../metadata'),
    ])

  return {
    downloader: createDownloader(),
    processor: new FfmpegProcessor(),
    driveStorage: createDriveStorage(),
    metadataProvider: createMetadataProvider(),
    tempFileManager: new TempFileManager(),
    getNicheSlug: getNicheSlugById,
  }
}

/**
 * Runs download → FFmpeg → Drive upload → temp cleanup for a claimed job.
 * Returns final status (ready_to_upload on success).
 */
export async function runProcessPipeline(
  job: DbJobRow,
  deps?: ProcessPipelineDeps,
): Promise<JobStatus> {
  const resolvedDeps = deps ?? (await createDefaultPipelineDeps())
  const { withFfmpegConcurrency } = await import('./ConcurrencyGuard')

  const jobId = job.id
  let tempCreated = false

  try {
    const tempDir = await resolvedDeps.tempFileManager.createJobDir(jobId)
    tempCreated = true

    await updateJobStatus(jobId, 'downloading', { download_status: 'running' })
    await writeJobEvent(jobId, 'download', 'download_started', 'Starting source download')

    const downloadResult = await resolvedDeps.downloader.download({
      sourceUrl: job.source_url,
      jobId,
      tempDir,
      sourcePlatform: job.source_platform,
    })

    await updateJobStatus(jobId, 'downloaded', { download_status: 'succeeded' })
    await writeJobEvent(jobId, 'download', 'download_completed', 'Source download complete', 'info', {
      fileSize: downloadResult.fileSize,
      hasSourceTitle: Boolean(downloadResult.title),
      hasSourceDescription: Boolean(downloadResult.description),
      sourceDescriptionLength: downloadResult.description?.length ?? 0,
    })

    const nicheSlug = await resolvedDeps.getNicheSlug(job.niche_id)
    if (!nicheSlug || !isValidNicheSlug(nicheSlug)) {
      throw new ProjectApiError(
        ERROR_CODES.NICHE_ACCOUNT_NOT_FOUND,
        `Niche slug not found for niche_id: ${job.niche_id}`,
        { stage: 'processing', retryable: false },
      )
    }

    const watermarkPath = resolveWatermarkPath(nicheSlug)

    await updateJobStatus(jobId, 'processing', { processing_status: 'running' })
    await writeJobEvent(jobId, 'process', 'processing_started', 'Starting FFmpeg processing', 'info', {
      nicheSlug,
      watermarkPath,
    })

    const processResult = await withFfmpegConcurrency(() =>
      resolvedDeps.processor.process({
        jobId,
        sourcePath: downloadResult.localPath,
        tempDir,
        watermarkPath,
      }),
    )

    await updateJobStatus(jobId, 'processed', {
      processing_status: 'succeeded',
      processed_at: new Date().toISOString(),
    })
    await writeJobEvent(jobId, 'process', 'processing_completed', 'FFmpeg processing complete', 'info', {
      outputSize: processResult.fileSize,
      watermarkPath,
    })

    await updateJobStatus(jobId, 'staging_to_drive')
    await writeJobEvent(jobId, 'staging_to_drive', 'drive_upload_started', 'Starting Drive upload')

    const driveResult = await resolvedDeps.driveStorage.upload({
      jobId,
      nicheSlug,
      localFilePath: processResult.outputPath,
    })

    await writeJobEvent(jobId, 'staging_to_drive', 'drive_upload_completed', 'Drive upload complete', 'info', {
      driveFileId: driveResult.fileId,
    })

    await writeJobEvent(jobId, 'metadata', 'metadata_generation_started', 'Starting metadata generation')

    const metadata = await resolvedDeps.metadataProvider.generate({
      jobId,
      sourceUrl: job.source_url,
      sourcePlatform: job.source_platform,
      nicheSlug,
      sourceTitle: downloadResult.title,
      sourceDescription: downloadResult.description,
      sourceChannel: downloadResult.uploader,
    })

    const metadataStatus = metadata.generatedBy === 'ai' ? 'generated' : 'fallback_used'

    await updateJobStatus(jobId, 'ready_to_upload', {
      drive_file_id: driveResult.fileId,
      drive_file_name: driveResult.fileName,
      drive_view_url: driveResult.viewUrl ?? null,
      drive_folder_state: driveResult.folderState,
      youtube_title: metadata.youtubeTitle,
      youtube_description: metadata.youtubeDescription,
      instagram_caption: metadata.instagramCaption,
      metadata_status: metadataStatus,
    })
    await writeJobEvent(jobId, 'metadata', 'metadata_generation_completed', 'Metadata generation complete', 'info', {
      generatedBy: metadata.generatedBy,
      model: metadata.model,
    })

    await resolvedDeps.tempFileManager.cleanupJobDir(jobId)
    tempCreated = false

    return 'ready_to_upload'
  } catch (err: unknown) {
    if (tempCreated) {
      await resolvedDeps.tempFileManager.cleanupJobDir(jobId)
    }
    await recordPipelineFailure(jobId, err)
    throw err
  }
}
