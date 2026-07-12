'use server'

import { requireAdminWrite } from '@/lib/auth/requireAdmin'
import { getAdminUsername } from '@/lib/auth/getUserRole'
import { supabaseAdmin } from '@/lib/supabase/admin'

type AdminCommandType = 'retry_upload' | 'delete_drive_file'

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

/** Queue upload retry for local worker/n8n (does not call worker from Vercel). */
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
    // Crash zombies: worker may leave status=uploading with one platform done.
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

/** Queue Drive delete for local worker/n8n (does not call worker from Vercel). */
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

  const deletableStatuses = ['failed', 'needs_manual_review', 'completed']
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

/** Mark job cancelled (DB-only; stops auto retry/claim). */
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
  ]
  if (!cancellable.includes(job.status)) {
    return { success: false, error: `Job status ${job.status} cannot be cancelled` }
  }

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

  const username = await getAdminUsername()
  await supabaseAdmin.from('audit_logs').insert({
    actor_type: 'admin',
    action: 'job_cancelled',
    target_type: 'job',
    target_id: jobId,
    metadata: { username, status_before: job.status },
  })

  await supabaseAdmin.from('job_events').insert({
    job_id: jobId,
    stage: 'admin',
    event_type: 'job_cancelled',
    message: `Cancelled by admin (was ${job.status})`,
    severity: 'info',
    metadata: { username, status_before: job.status },
  })

  return { success: true, jobId }
}

/**
 * Permanently delete a job row from Supabase (cascades events/attempts/commands).
 * Does not remove YouTube/Instagram posts. Staged Drive files are not deleted —
 * remove those first from Failed Review when a Drive link still exists.
 */
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

  const blocked = ['locked', 'downloading', 'processing', 'uploading', 'staging_to_drive']
  if (blocked.includes(job.status)) {
    return {
      success: false,
      error: `Job is actively ${job.status}. Cancel it or wait until it finishes, then delete.`,
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

/** Mark job ignored (DB-only; no worker required). */
export async function markJobIgnored(jobId: string) {
  const writeGate = await requireAdminWrite()
  if (writeGate.denied) return { success: false, error: writeGate.error }

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

/** Bulk retry upload — queues one admin_command per eligible job. */
export async function bulkRetryJobUploads(jobIds: string[]) {
  return runBulkJobAction(jobIds, retryJobUpload, 'queued for retry')
}

/** Bulk Drive delete — queues one admin_command per eligible job. */
export async function bulkDeleteDriveFiles(jobIds: string[]) {
  return runBulkJobAction(jobIds, deleteDriveFile, 'queued for Drive delete')
}

/** Bulk mark ignored — DB-only. */
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

/** Clear login_required and set account active after manual browser login. */
export async function markAccountLoginRecovered(accountId: string): Promise<AccountActionResult> {
  return updatePlatformAccountStatus(
    accountId,
    { status: 'active', login_required: false },
    'account_login_recovered',
    'Account marked login recovered (active).',
  )
}

/** Pause account so worker skips it for new uploads. */
export async function pausePlatformAccount(accountId: string): Promise<AccountActionResult> {
  return updatePlatformAccountStatus(
    accountId,
    { status: 'paused', login_required: false },
    'account_paused',
    'Account paused.',
  )
}

/** Resume a paused (or previously failing) account to active. */
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
