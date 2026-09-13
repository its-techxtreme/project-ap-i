'use server'

import { requireAdminWrite } from '@/lib/auth/requireAdmin'
import { getAdminUsername } from '@/lib/auth/getUserRole'
import {
  COLLECTOR_CREW_ACCOUNT_ID,
  COLLECTOR_LOGIN_SETTING_KEY,
} from '@/lib/admin/collectorCrew'
import { supabaseAdmin } from '@/lib/supabase/admin'

type AdminCommandType = 'retry_upload' | 'delete_drive_file' | 'abort_job'

const IN_FLIGHT_STATUSES = [
  'locked',
  'validating',
  'downloading',
  'downloaded',
  'processing',
  'processed',
  'staging_to_drive',
  'ready_to_upload',
  'uploading',
] as const

async function enqueueAdminCommand(
  jobId: string,
  command: AdminCommandType,
  payload: Record<string, unknown> = {},
): Promise<{ success: true; commandId: string } | { success: false; error: string }> {
  const requestedByUsername = await getAdminUsername()

  const { data, error } = await supabaseAdmin
    .from('admin_commands')
    .insert({
      job_id: jobId,
      command,
      status: 'pending',
      requested_by: null,
      payload: {
        ...payload,
        requested_by_username: requestedByUsername,
      },
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      return {
        success: false,
        error: 'That action is already queued. It will run when the local worker/n8n stack is up.',
      }
    }
    return { success: false, error: error.message }
  }

  return { success: true, commandId: data.id }
}

/** Vercel cannot reach the laptop. This only inserts admin_commands.retry_upload. */
export async function retryJobUpload(jobId: string) {
  const writeGate = await requireAdminWrite()
  if (writeGate.denied) return { success: false, error: writeGate.error }

  const { data: job, error: jobError } = await supabaseAdmin
    .from('jobs')
    .select('id, status, drive_file_id, drive_deleted_at, youtube_retry_count, instagram_retry_count')
    .eq('id', jobId)
    .single()

  if (jobError || !job) {
    return { success: false, error: 'Job not found' }
  }

  const retryableStatuses = [
    'failed',
    'needs_manual_review',
    'awaiting_verification',
    'ready_to_upload',
    // Worker died mid-upload. Status can sit on uploading even if YT already posted.
    'uploading',
  ]
  if (!retryableStatuses.includes(job.status)) {
    return { success: false, error: `Job status ${job.status} is not retryable` }
  }

  if (!job.drive_file_id || job.drive_deleted_at) {
    return { success: false, error: 'Drive file missing or deleted, cannot retry upload' }
  }

  const queued = await enqueueAdminCommand(jobId, 'retry_upload', { platform: 'both' })
  if (!queued.success) {
    return queued
  }

  const username = await getAdminUsername()
  await supabaseAdmin.from('audit_logs').insert({
    actor_type: 'admin',
    action: 'manual_retry_requested',
    target_type: 'job',
    target_id: jobId,
    metadata: {
      commandId: queued.commandId,
      queued: true,
      username,
      status_before: job.status,
      retry_counts: { youtube: job.youtube_retry_count, instagram: job.instagram_retry_count },
    },
  })

  return {
    success: true,
    jobId,
    commandId: queued.commandId,
    queued: true,
    message: 'Retry queued. It will run when the local worker/n8n stack is up.',
  }
}

/** Soft daily cap only. YouTube and Instagram still enforce their own hard limits. */
export async function forceStartDespiteDailyLimit(jobId: string) {
  const writeGate = await requireAdminWrite()
  if (writeGate.denied) return { success: false, error: writeGate.error }

  const { data: job, error: jobError } = await supabaseAdmin
    .from('jobs')
    .select(
      'id, status, failure_code, failure_reason, drive_file_id, drive_deleted_at, youtube_upload_status, instagram_upload_status',
    )
    .eq('id', jobId)
    .single()

  if (jobError || !job) {
    return { success: false, error: 'Job not found' }
  }

  const reason = (job.failure_reason ?? '').toLowerCase()
  const isDailyLimit =
    job.failure_code === 'DAILY_UPLOAD_LIMIT_REACHED' || reason.includes('daily upload limit')

  if (!isDailyLimit) {
    return {
      success: false,
      error: 'Force start is only available when the job is parked for the daily upload limit.',
    }
  }

  const allowed = ['queued', 'ready_to_upload', 'failed', 'needs_manual_review', 'awaiting_verification']
  if (!allowed.includes(job.status)) {
    return { success: false, error: `Cannot force-start job in status ${job.status}` }
  }

  // Backdate created_at so FIFO claim grabs this row next.
  const frontCreatedAt = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
  const nowIso = new Date().toISOString()

  const nextStatus =
    job.status === 'ready_to_upload' ||
    job.status === 'failed' ||
    job.status === 'needs_manual_review' ||
    job.status === 'awaiting_verification'
      ? job.drive_file_id && !job.drive_deleted_at
        ? 'ready_to_upload'
        : 'queued'
      : 'queued'

  const patch: Record<string, unknown> = {
    force_upload_override: true,
    failure_code: null,
    failure_reason: null,
    status: nextStatus,
    locked_by: null,
    locked_at: null,
    lock_expires_at: null,
    updated_at: nowIso,
  }
  if (nextStatus === 'queued') {
    patch.created_at = frontCreatedAt
  }

  const { error: updateError } = await supabaseAdmin.from('jobs').update(patch).eq('id', jobId)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  // Already on Drive: also queue retry_upload so n8n does not wait for the next poll.
  let commandId: string | undefined
  const needsUploadRetry =
    Boolean(job.drive_file_id) && !job.drive_deleted_at && nextStatus === 'ready_to_upload'

  if (needsUploadRetry) {
    const queued = await enqueueAdminCommand(jobId, 'retry_upload', {
      platform: 'both',
      forceDailyLimitBypass: true,
    })
    if (queued.success) commandId = queued.commandId
  }

  const username = await getAdminUsername()
  await supabaseAdmin.from('audit_logs').insert({
    actor_type: 'admin',
    action: 'force_start_despite_daily_limit',
    target_type: 'job',
    target_id: jobId,
    metadata: {
      username,
      status_before: job.status,
      commandId: commandId ?? null,
      failure_code_before: job.failure_code,
    },
  })

  await supabaseAdmin.from('job_events').insert({
    job_id: jobId,
    stage: 'admin',
    event_type: 'force_start_despite_daily_limit',
    message: 'Admin force-started job past soft daily upload limit',
    severity: 'info',
    metadata: { username, commandId: commandId ?? null },
  })

  return {
    success: true,
    jobId,
    commandId,
    message: needsUploadRetry
      ? 'Force-start armed. Upload retry queued — runs when the local worker/n8n stack is up.'
      : 'Force-start armed. Job moved to the front of the queue and will bypass the soft daily limit once.',
  }
}

/** Outbox delete. Hosted Next never talks to Drive itself. */
export async function deleteDriveFile(jobId: string) {
  const writeGate = await requireAdminWrite()
  if (writeGate.denied) return { success: false, error: writeGate.error }

  const { data: job, error: jobError } = await supabaseAdmin
    .from('jobs')
    .select('id, status, drive_file_id, drive_deleted_at, drive_folder_state')
    .eq('id', jobId)
    .single()

  if (jobError || !job) {
    return { success: false, error: 'Job not found' }
  }

  if (!job.drive_file_id) {
    return { success: false, error: 'Job has no Drive file to delete' }
  }

  const deletableStatuses = [
    'failed',
    'needs_manual_review',
    'completed',
    'cancelled',
    'ignored',
    'paused',
  ]
  if (!deletableStatuses.includes(job.status)) {
    return { success: false, error: `Drive delete not allowed for job status: ${job.status}` }
  }

  const queued = await enqueueAdminCommand(jobId, 'delete_drive_file')
  if (!queued.success) {
    return queued
  }

  const username = await getAdminUsername()
  await supabaseAdmin.from('audit_logs').insert({
    actor_type: 'admin',
    action: 'drive_delete_requested',
    target_type: 'job',
    target_id: jobId,
    metadata: {
      commandId: queued.commandId,
      queued: true,
      username,
      drive_file_id: job.drive_file_id,
      status: job.status,
    },
  })

  return {
    success: true,
    jobId,
    commandId: queued.commandId,
    queued: true,
    message: 'Drive delete queued. It will run when the local worker/n8n stack is up.',
  }
}

/** Cancel in Supabase. If Chrome or FFmpeg is running, also enqueue abort_job. */
export async function cancelJob(jobId: string) {
  const writeGate = await requireAdminWrite()
  if (writeGate.denied) return { success: false, error: writeGate.error }

  const { data: job, error: jobError } = await supabaseAdmin
    .from('jobs')
    .select('id, status')
    .eq('id', jobId)
    .single()

  if (jobError || !job) {
    return { success: false, error: 'Job not found' }
  }

  const cancellable = [
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
    'failed',
    'needs_manual_review',
    'paused',
  ]
  if (!cancellable.includes(job.status)) {
    return { success: false, error: `Job status ${job.status} cannot be cancelled` }
  }

  const wasInFlight = (IN_FLIGHT_STATUSES as readonly string[]).includes(job.status)

  const { error: updateError } = await supabaseAdmin
    .from('jobs')
    .update({
      status: 'cancelled',
      failure_code: null,
      failure_reason: 'Cancelled by admin',
      locked_by: null,
      locked_at: null,
      lock_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  let abortCommandId: string | undefined
  if (wasInFlight) {
    const queued = await enqueueAdminCommand(jobId, 'abort_job', { reason: 'cancel' })
    if (queued.success) abortCommandId = queued.commandId
  }

  const username = await getAdminUsername()
  await supabaseAdmin.from('audit_logs').insert({
    actor_type: 'admin',
    action: 'job_cancelled',
    target_type: 'job',
    target_id: jobId,
    metadata: { username, status_before: job.status, abortCommandId },
  })

  await supabaseAdmin.from('job_events').insert({
    job_id: jobId,
    stage: 'admin',
    event_type: 'job_cancelled',
    message: `Cancelled by admin (was ${job.status})`,
    severity: 'info',
    metadata: { username, status_before: job.status, abortCommandId },
  })

  return {
    success: true,
    jobId,
    message: wasInFlight
      ? 'Job cancelled. Abort queued for the local worker to stop in-flight work.'
      : 'Job cancelled.',
  }
}

/** Claim skips paused rows. Abort if a worker step is already in flight. */
export async function pauseJob(jobId: string) {
  const writeGate = await requireAdminWrite()
  if (writeGate.denied) return { success: false, error: writeGate.error }

  const { data: job, error: jobError } = await supabaseAdmin
    .from('jobs')
    .select('id, status')
    .eq('id', jobId)
    .single()

  if (jobError || !job) {
    return { success: false, error: 'Job not found' }
  }

  const pausable = [
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
    'failed',
    'needs_manual_review',
  ]
  if (!pausable.includes(job.status)) {
    return { success: false, error: `Job status ${job.status} cannot be paused` }
  }

  const wasInFlight = (IN_FLIGHT_STATUSES as readonly string[]).includes(job.status)

  const { error: updateError } = await supabaseAdmin
    .from('jobs')
    .update({
      status: 'paused',
      failure_reason: `Paused by admin (was ${job.status})`,
      locked_by: null,
      locked_at: null,
      lock_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  let abortCommandId: string | undefined
  if (wasInFlight) {
    const queued = await enqueueAdminCommand(jobId, 'abort_job', { reason: 'pause' })
    if (queued.success) abortCommandId = queued.commandId
  }

  const username = await getAdminUsername()
  await supabaseAdmin.from('audit_logs').insert({
    actor_type: 'admin',
    action: 'job_paused',
    target_type: 'job',
    target_id: jobId,
    metadata: { username, status_before: job.status, abortCommandId },
  })

  await supabaseAdmin.from('job_events').insert({
    job_id: jobId,
    stage: 'admin',
    event_type: 'job_paused',
    message: `Paused by admin (was ${job.status})`,
    severity: 'info',
    metadata: { username, status_before: job.status },
  })

  return {
    success: true,
    jobId,
    message: wasInFlight
      ? 'Job paused. Abort queued so the worker stops in-flight work; other jobs proceed.'
      : 'Job paused. Other queued jobs will proceed ahead of it.',
  }
}

/** Unpause. Stamp created_at now so it goes to the back of the queue. */
export async function unpauseJob(jobId: string) {
  const writeGate = await requireAdminWrite()
  if (writeGate.denied) return { success: false, error: writeGate.error }

  const { data: job, error: jobError } = await supabaseAdmin
    .from('jobs')
    .select('id, status')
    .eq('id', jobId)
    .single()

  if (jobError || !job) {
    return { success: false, error: 'Job not found' }
  }

  if (job.status !== 'paused') {
    return { success: false, error: `Job status ${job.status} is not paused` }
  }

  const nowIso = new Date().toISOString()
  const { error: updateError } = await supabaseAdmin
    .from('jobs')
    .update({
      status: 'queued',
      created_at: nowIso,
      failure_code: null,
      failure_reason: null,
      locked_by: null,
      locked_at: null,
      lock_expires_at: null,
      updated_at: nowIso,
    })
    .eq('id', jobId)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  const username = await getAdminUsername()
  await supabaseAdmin.from('audit_logs').insert({
    actor_type: 'admin',
    action: 'job_unpaused',
    target_type: 'job',
    target_id: jobId,
    metadata: { username, queue_rank: 'end' },
  })

  await supabaseAdmin.from('job_events').insert({
    job_id: jobId,
    stage: 'admin',
    event_type: 'job_unpaused',
    message: 'Unpaused by admin — requeued at end of queue',
    severity: 'info',
    metadata: { username },
  })

  return { success: true, jobId, message: 'Job unpaused and moved to the end of the queue.' }
}

/** Hard-delete the job row. Cancel+abort first if it is still running. */
export async function deleteJobRecord(jobId: string) {
  const writeGate = await requireAdminWrite()
  if (writeGate.denied) return { success: false, error: writeGate.error }

  const { data: job, error: jobError } = await supabaseAdmin
    .from('jobs')
    .select('id, status, drive_file_id, drive_deleted_at, source_url, niche_id')
    .eq('id', jobId)
    .single()

  if (jobError || !job) {
    return { success: false, error: 'Job not found' }
  }

  const blocked = ['locked', 'downloading', 'downloaded', 'processing', 'processed', 'uploading', 'staging_to_drive', 'validating']
  if (blocked.includes(job.status)) {
    const cancelled = await cancelJob(jobId)
    if (!cancelled.success) {
      return {
        success: false,
        error: `Job is actively ${job.status} and could not be cancelled first: ${cancelled.error}`,
      }
    }
  }

  const username = await getAdminUsername()
  const hasDrive = Boolean(job.drive_file_id) && !job.drive_deleted_at

  await supabaseAdmin.from('audit_logs').insert({
    actor_type: 'admin',
    action: 'job_deleted',
    target_type: 'job',
    target_id: jobId,
    metadata: {
      username,
      status_before: job.status,
      drive_file_id: job.drive_file_id,
      drive_deleted_at: job.drive_deleted_at,
      source_url: job.source_url,
      niche_id: job.niche_id,
      orphan_drive_possible: hasDrive,
    },
  })

  const { error: deleteError } = await supabaseAdmin.from('jobs').delete().eq('id', jobId)
  if (deleteError) {
    return { success: false, error: deleteError.message }
  }

  return {
    success: true,
    jobId,
    message: hasDrive
      ? 'Job deleted. A staged Drive file may still exist — delete it from Drive if needed.'
      : 'Job deleted.',
  }
}

/** Hide from Failed Review. Worker does not need to be up. */
export async function markJobIgnored(jobId: string) {
  const writeGate = await requireAdminWrite()
  if (writeGate.denied) return { success: false, error: writeGate.error }

  const { data: job, error: jobError } = await supabaseAdmin
    .from('jobs')
    .select('id, status')
    .eq('id', jobId)
    .single()

  if (jobError || !job) {
    return { success: false, error: 'Job not found' }
  }

  const ignorable = ['failed', 'needs_manual_review', 'cancelled', 'paused', 'ignored']
  if (!ignorable.includes(job.status)) {
    return { success: false, error: `Job status ${job.status} cannot be ignored` }
  }

  const { error: updateError } = await supabaseAdmin
    .from('jobs')
    .update({ status: 'ignored', updated_at: new Date().toISOString() })
    .eq('id', jobId)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  const username = await getAdminUsername()
  await supabaseAdmin.from('audit_logs').insert({
    actor_type: 'admin',
    action: 'job_marked_ignored',
    target_type: 'job',
    target_id: jobId,
    metadata: { username },
  })

  return { success: true, jobId }
}

/** Paste the YouTube URL we missed. Do not upload again. */
export async function setYoutubeUploadedUrl(jobId: string, youtubeUrl: string) {
  const writeGate = await requireAdminWrite()
  if (writeGate.denied) return { success: false, error: writeGate.error }

  const trimmed = youtubeUrl.trim()
  if (!/youtu\.be\/|youtube\.com\/(watch|shorts)/i.test(trimmed)) {
    return { success: false, error: 'Provide a real YouTube watch/shorts/youtu.be URL' }
  }

  const { data: job, error: jobError } = await supabaseAdmin
    .from('jobs')
    .select('id, status, youtube_upload_status, instagram_upload_status')
    .eq('id', jobId)
    .single()

  if (jobError || !job) {
    return { success: false, error: 'Job not found' }
  }

  const allowed = ['needs_manual_review', 'failed', 'paused', 'awaiting_verification']
  if (!allowed.includes(job.status)) {
    return { success: false, error: `Cannot set YouTube URL for status ${job.status}` }
  }

  const { error: updateError } = await supabaseAdmin
    .from('jobs')
    .update({
      youtube_upload_status: 'uploaded',
      failure_code: null,
      failure_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  await supabaseAdmin.from('upload_attempts').insert({
    job_id: jobId,
    platform: 'youtube',
    attempt_number: 99,
    status: 'uploaded',
    platform_url: trimmed,
    platform_media_id: trimmed,
    finished_at: new Date().toISOString(),
  })

  const username = await getAdminUsername()
  await supabaseAdmin.from('audit_logs').insert({
    actor_type: 'admin',
    action: 'youtube_url_set_manually',
    target_type: 'job',
    target_id: jobId,
    metadata: { username, youtubeUrl: trimmed },
  })

  return { success: true, jobId, message: 'YouTube URL recorded as uploaded (no re-publish).' }
}

type BulkItemResult = { success: boolean; error?: string; message?: string }

export type BulkActionResult = {
  success: true
  succeeded: number
  failed: number
  errors: string[]
  message: string
}

async function runBulkJobAction(
  jobIds: string[],
  action: (jobId: string) => Promise<BulkItemResult>,
  verbPast: string,
): Promise<BulkActionResult | { success: false; error: string }> {
  const writeGate = await requireAdminWrite()
  if (writeGate.denied) return { success: false, error: writeGate.error }

  const uniqueIds = [...new Set(jobIds.filter(Boolean))]
  if (uniqueIds.length === 0) {
    return { success: false, error: 'No jobs selected' }
  }

  let succeeded = 0
  let failed = 0
  const errors: string[] = []

  for (const jobId of uniqueIds) {
    const result = await action(jobId)
    if (result.success) {
      succeeded += 1
    } else {
      failed += 1
      errors.push(`${jobId.slice(0, 8)}: ${result.error ?? 'failed'}`)
    }
  }

  const message =
    failed === 0
      ? `${succeeded} job(s) ${verbPast}.`
      : `${succeeded} succeeded, ${failed} failed. ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '…' : ''}`

  return { success: true, succeeded, failed, errors, message }
}

/** One retry_upload command per selected job. */
export async function bulkRetryJobUploads(jobIds: string[]) {
  return runBulkJobAction(jobIds, retryJobUpload, 'queued for retry')
}

/** One Drive delete command per selected job. */
export async function bulkDeleteDriveFiles(jobIds: string[]) {
  return runBulkJobAction(jobIds, deleteDriveFile, 'queued for Drive delete')
}

/** Bulk ignore. Same as markJobIgnored, looped. */
export async function bulkMarkJobsIgnored(jobIds: string[]) {
  return runBulkJobAction(jobIds, markJobIgnored, 'marked ignored')
}

type AccountActionResult =
  | { success: true; accountId: string; message: string }
  | { success: false; error: string }

async function updatePlatformAccountStatus(
  accountId: string,
  next: { status: string; login_required: boolean },
  auditAction: string,
  message: string,
): Promise<AccountActionResult> {
  const writeGate = await requireAdminWrite()
  if (writeGate.denied) return { success: false, error: writeGate.error }

  const { data: account, error: fetchError } = await supabaseAdmin
    .from('platform_accounts')
    .select('id, status, login_required')
    .eq('id', accountId)
    .single()

  if (fetchError || !account) {
    return { success: false, error: 'Account not found' }
  }

  const { error: updateError } = await supabaseAdmin
    .from('platform_accounts')
    .update({
      status: next.status,
      login_required: next.login_required,
      updated_at: new Date().toISOString(),
    })
    .eq('id', accountId)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  const username = await getAdminUsername()
  await supabaseAdmin.from('audit_logs').insert({
    actor_type: 'admin',
    action: auditAction,
    target_type: 'platform_account',
    target_id: accountId,
    metadata: {
      username,
      status_before: account.status,
      login_required_before: account.login_required,
      status_after: next.status,
      login_required_after: next.login_required,
    },
  })

  return { success: true, accountId, message }
}

/** You logged in by hand. Clear login_required and mark the account active. */
export async function markAccountLoginRecovered(accountId: string): Promise<AccountActionResult> {
  return updatePlatformAccountStatus(
    accountId,
    { status: 'active', login_required: false },
    'account_login_recovered',
    'Account marked login recovered (active).',
  )
}

/** Pause so the worker will not pick this account for new uploads. */
export async function pausePlatformAccount(accountId: string): Promise<AccountActionResult> {
  return updatePlatformAccountStatus(
    accountId,
    { status: 'paused', login_required: false },
    'account_paused',
    'Account paused.',
  )
}

/** Unpause a paused or failing account. */
export async function resumePlatformAccount(accountId: string): Promise<AccountActionResult> {
  const writeGate = await requireAdminWrite()
  if (writeGate.denied) return { success: false, error: writeGate.error }

  const { data: account, error: fetchError } = await supabaseAdmin
    .from('platform_accounts')
    .select('id, status, login_required')
    .eq('id', accountId)
    .single()

  if (fetchError || !account) {
    return { success: false, error: 'Account not found' }
  }

  if (account.status === 'login_required' || account.login_required) {
    return {
      success: false,
      error: 'Account still requires login. Use Mark Login Recovered after fixing the session.',
    }
  }

  if (account.status === 'disabled') {
    return { success: false, error: 'Disabled accounts cannot be resumed from the dashboard.' }
  }

  return updatePlatformAccountStatus(
    accountId,
    { status: 'active', login_required: false },
    'account_resumed',
    'Account resumed (active).',
  )
}

/** You logged the collector IG profile in by hand. */
export async function markCollectorLoginRecovered(): Promise<AccountActionResult> {
  const writeGate = await requireAdminWrite()
  if (writeGate.denied) return { success: false, error: writeGate.error }

  const { error } = await supabaseAdmin.from('system_settings').upsert(
    {
      key: COLLECTOR_LOGIN_SETTING_KEY,
      value: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  )
  if (error) return { success: false, error: error.message }

  await supabaseAdmin.from('audit_logs').insert({
    actor_type: 'admin',
    action: 'collector_login_recovered',
    target_type: 'collector',
    target_id: COLLECTOR_CREW_ACCOUNT_ID,
    metadata: { username: await getAdminUsername() },
  })

  return {
    success: true,
    accountId: COLLECTOR_CREW_ACCOUNT_ID,
    message: 'Collector login cleared. Next worker heartbeat will drop the login-required flag.',
  }
}
