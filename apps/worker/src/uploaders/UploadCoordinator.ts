import { ERROR_CODES, ProjectApiError } from '@project-api/shared'

import { updateJobStatus, writeJobEvent } from '../db/jobsRepo'
import { supabaseAdmin } from '../db/supabaseAdmin'
import { logger } from '../logging/logger'

import { resolveNicheAccounts } from './accountResolver'
import type { PlatformUploader, UploadJobInput } from './types'

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

    await this.uploadToPlatform({
      job,
      platform: 'instagram',
      account: accounts.instagram,
      uploader: this.instagramUploader,
      metadata: { instagramCaption: job.instagramCaption },
    })
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

    const result = await uploader.upload({
      jobId: job.id,
      nicheSlug: job.nicheSlug,
      driveFileId: job.driveFileId,
      driveViewUrl: job.driveViewUrl,
      platform,
      account,
      metadata,
    })

    const attemptStatus = result.success
      ? 'uploaded'
      : result.loginRequired
        ? 'login_required'
        : 'failed'

    await supabaseAdmin
      .from('upload_attempts')
      .update({
        status: attemptStatus,
        platform_media_id: result.platformMediaId ?? null,
        platform_url: result.platformUrl ?? null,
        error_code: result.errorCode ?? null,
        error_message: result.errorMessage ?? null,
        login_required: result.loginRequired ?? false,
        finished_at: new Date().toISOString(),
      })
      .eq('id', attempt.id)

    const statusField = platform === 'youtube' ? 'youtube_upload_status' : 'instagram_upload_status'
    const platformStatus = result.success
      ? 'uploaded'
      : result.loginRequired
        ? 'login_required'
        : 'failed'

    await supabaseAdmin
      .from('jobs')
      .update({ [statusField]: platformStatus })
      .eq('id', job.id)

    if (result.loginRequired) {
      await supabaseAdmin
        .from('platform_accounts')
        .update({ login_required: true, status: 'login_required' })
        .eq('id', account.id)
    }
  }
}
