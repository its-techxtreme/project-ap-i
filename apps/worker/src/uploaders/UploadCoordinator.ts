import { ERROR_CODES, ProjectApiError } from '@project-api/shared'

import { config } from '../config'
import { updateJobStatus, writeJobEvent } from '../db/jobsRepo'
import { supabaseAdmin } from '../db/supabaseAdmin'
import { logger } from '../logging/logger'

import { prepareYoutubeUploadVariant } from '../processors/prepareYoutubeUploadVariant'
import { resolveNicheAccounts } from './accountResolver'
import { isDailyUploadLimitError } from '../jobs/dailyUploadLimit'
import { findSuccessfulUploadAttempt } from '../jobs/uploadIdempotency'
import { assertJobNotAborted } from '../jobs/jobAbort'
import { isRealPlatformMediaId } from './platformMediaIds'
import { isTransientUploadFailure } from './transientUploadErrors'
import type { PlatformUploader, UploadJobInput, UploadResult } from './types'

const TRANSIENT_UPLOAD_ATTEMPTS = 3

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withUploadTimeout(
  upload: Promise<UploadResult>,
  platform: 'youtube' | 'instagram',
  timeoutMs: number,
): Promise<UploadResult> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      upload,
      new Promise<UploadResult>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${platform} upload timed out after ${timeoutMs}ms`))
        }, timeoutMs)
      }),
    ])
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      errorCode: platform === 'youtube' ? 'YOUTUBE_UPLOAD_FAILED' : 'INSTAGRAM_UPLOAD_FAILED',
      errorMessage: message,
    }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export class UploadCoordinator {
  constructor(
    private readonly youtubeUploader: PlatformUploader,
    private readonly instagramUploader: PlatformUploader,
  ) {}

  async uploadBothPlatforms(job: UploadJobInput): Promise<void> {
    let accounts
    try {
      accounts = await resolveNicheAccounts(job.nicheId)
    } catch (err) {
      await updateJobStatus(job.id, 'needs_manual_review', {
        failure_code: ERROR_CODES.NICHE_ACCOUNT_MAPPING_INVALID,
        failure_reason: err instanceof ProjectApiError ? err.message : 'Account mapping invalid',
      })
      throw err
    }

    await supabaseAdmin
      .from('jobs')
      .update({
        target_youtube_account_id: accounts.youtube.id,
        target_instagram_account_id: accounts.instagram.id,
      })
      .eq('id', job.id)

    const platforms = job.platformsToUpload ?? (['youtube', 'instagram'] as const)

    if (platforms.includes('youtube')) {
      await assertJobNotAborted(job.id)
      await this.uploadToPlatform({
        job,
        platform: 'youtube',
        account: accounts.youtube,
        uploader: this.youtubeUploader,
        metadata: {
          youtubeTitle: job.youtubeTitle,
          youtubeDescription: job.youtubeDescription,
        },
      })
    }

    await assertJobNotAborted(job.id)

    if (platforms.includes('instagram')) {
      await this.uploadToPlatform({
        job,
        platform: 'instagram',
        account: accounts.instagram,
        uploader: this.instagramUploader,
        metadata: { instagramCaption: job.instagramCaption },
      })
    }
  }

  private async uploadToPlatform(params: {
    job: UploadJobInput
    platform: 'youtube' | 'instagram'
    account: { id: string; accountLabel: string; browserProfilePath?: string }
    uploader: PlatformUploader
    metadata: Record<string, string | undefined>
  }): Promise<void> {
    const { job, platform, account, uploader, metadata } = params
    const attemptNumber =
      platform === 'youtube' ? job.youtubeRetryCount + 1 : job.instagramRetryCount + 1

    // Idempotency: never re-publish if a real platform URL was already recorded.
    const existing = await findSuccessfulUploadAttempt(job.id, platform)
    if (existing) {
      const statusField = platform === 'youtube' ? 'youtube_upload_status' : 'instagram_upload_status'
      await supabaseAdmin
        .from('jobs')
        .update({ [statusField]: 'uploaded' })
        .eq('id', job.id)
      await writeJobEvent(
        job.id,
        'upload',
        `${platform}_upload_skipped_idempotent`,
        `${platform} already has recorded upload ${existing.platformUrl} — skipping Playwright`,
        'info',
        { platform, platformUrl: existing.platformUrl, attemptId: existing.attemptId },
      )
      logger.info({
        msg: 'Skipping platform upload — successful attempt already recorded',
        jobId: job.id,
        platform,
        platformUrl: existing.platformUrl,
      })
      return
    }

    await writeJobEvent(
      job.id,
      'upload',
      `${platform}_upload_started`,
      `Starting ${platform} upload attempt ${attemptNumber}`,
    )

    const { data: attempt, error: insertError } = await supabaseAdmin
      .from('upload_attempts')
      .insert({
        job_id: job.id,
        platform,
        platform_account_id: account.id,
        attempt_number: attemptNumber,
        status: 'started',
      })
      .select('id')
      .single()

    if (insertError || !attempt?.id) {
      logger.error({
        msg: 'Failed to create upload attempt record',
        jobId: job.id,
        platform,
        error: insertError?.message,
      })
      throw new ProjectApiError(
        ERROR_CODES.YOUTUBE_UPLOAD_FAILED,
        `Failed to record ${platform} upload attempt`,
        { stage: 'upload' },
      )
    }

    let result: UploadResult = {
      success: false,
      errorCode: platform === 'youtube' ? 'YOUTUBE_UPLOAD_FAILED' : 'INSTAGRAM_UPLOAD_FAILED',
      errorMessage: 'Upload did not run',
    }

    // Instagram uses the shared edit export. YouTube may get a niche brand
    // c-text overlay when the reel has no existing burned-in captions.
    let localFilePath = job.localFilePath
    if (platform === 'youtube' && job.localFilePath) {
      const ytVariant = await prepareYoutubeUploadVariant({
        jobId: job.id,
        nicheSlug: job.nicheSlug,
        sourcePath: job.localFilePath,
      })
      localFilePath = ytVariant.localFilePath
      logger.info({
        msg: 'YouTube upload file resolved',
        jobId: job.id,
        brandOverlayApplied: ytVariant.brandOverlayApplied,
        detectionReason: ytVariant.detectionReason,
        localFilePath,
      })
    }

    for (let transientTry = 0; transientTry < TRANSIENT_UPLOAD_ATTEMPTS; transientTry++) {
      result = await withUploadTimeout(
        uploader.upload({
          jobId: job.id,
          nicheSlug: job.nicheSlug,
          driveFileId: job.driveFileId,
          driveViewUrl: job.driveViewUrl,
          localFilePath,
          platform,
          account,
          metadata,
        }),
        platform,
        config.UPLOAD_PLATFORM_TIMEOUT_MS,
      )

      if (result.success || result.loginRequired || !isTransientUploadFailure(result)) {
        break
      }

      if (transientTry < TRANSIENT_UPLOAD_ATTEMPTS - 1) {
        const delayMs = 8_000 * (transientTry + 1)
        logger.warn({
          msg: 'Transient upload failure — in-process retry',
          jobId: job.id,
          platform,
          transientTry,
          delayMs,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
        })
        await sleep(delayMs)
      }
    }

    // Defense in depth: never persist "uploaded" with synthetic / missing media IDs.
    let effective = result
    if (
      result.success &&
      !isRealPlatformMediaId(platform, result.platformMediaId ?? result.platformUrl)
    ) {
      logger.error({
        msg: 'Uploader reported success without a real platform media URL — treating as failed',
        jobId: job.id,
        platform,
        platformMediaId: result.platformMediaId,
      })
      effective = {
        success: false,
        errorCode: platform === 'youtube' ? 'YOUTUBE_UPLOAD_FAILED' : 'INSTAGRAM_UPLOAD_FAILED',
        errorMessage:
          'Upload reported success without a real platform media URL (refusing synthetic id).',
      }
    }

    const hitDailyLimit =
      !effective.success &&
      !effective.loginRequired &&
      isDailyUploadLimitError(effective.errorMessage)

    const attemptStatus = effective.success
      ? 'uploaded'
      : effective.loginRequired
        ? 'login_required'
        : 'failed'

    await supabaseAdmin
      .from('upload_attempts')
      .update({
        status: attemptStatus,
        platform_media_id: effective.platformMediaId ?? null,
        platform_url: effective.platformUrl ?? null,
        error_code: hitDailyLimit
          ? ERROR_CODES.DAILY_UPLOAD_LIMIT_REACHED
          : (effective.errorCode ?? null),
        error_message: effective.errorMessage ?? null,
        login_required: effective.loginRequired ?? false,
        finished_at: new Date().toISOString(),
      })
      .eq('id', attempt.id)

    const statusField = platform === 'youtube' ? 'youtube_upload_status' : 'instagram_upload_status'
    const platformStatus = effective.success
      ? 'uploaded'
      : effective.loginRequired
        ? 'login_required'
        : hitDailyLimit
          ? 'pending'
          : 'failed'

    await supabaseAdmin
      .from('jobs')
      .update({ [statusField]: platformStatus })
      .eq('id', job.id)

    if (effective.success) {
      const publishedUrl = effective.platformUrl ?? effective.platformMediaId ?? null
      await writeJobEvent(
        job.id,
        'upload',
        `${platform}_upload_completed`,
        publishedUrl
          ? `${platform} upload completed: ${publishedUrl}`
          : `${platform} upload completed`,
        'info',
        {
          platform,
          platformUrl: publishedUrl,
          platformMediaId: effective.platformMediaId ?? null,
          attemptNumber,
        },
      )
    } else if (hitDailyLimit) {
      await writeJobEvent(
        job.id,
        'upload',
        'daily_upload_limit_deferred',
        effective.errorMessage ?? `${platform} daily upload limit reached`,
        'warning',
        {
          platform,
          errorCode: ERROR_CODES.DAILY_UPLOAD_LIMIT_REACHED,
          attemptNumber,
        },
      )
      throw new ProjectApiError(
        ERROR_CODES.DAILY_UPLOAD_LIMIT_REACHED,
        effective.errorMessage ??
          `${platform} daily upload limit reached — parking job until tomorrow`,
        { stage: 'upload', retryable: true },
      )
    } else {
      await writeJobEvent(
        job.id,
        'upload',
        `${platform}_upload_failed`,
        effective.errorMessage ?? `${platform} upload failed`,
        effective.loginRequired ? 'warning' : 'error',
        {
          platform,
          errorCode: effective.errorCode ?? null,
          loginRequired: effective.loginRequired ?? false,
          attemptNumber,
        },
      )
    }

    if (effective.loginRequired) {
      await supabaseAdmin
        .from('platform_accounts')
        .update({ login_required: true, status: 'login_required' })
        .eq('id', account.id)
    }
  }
}
