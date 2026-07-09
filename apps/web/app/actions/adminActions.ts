'use server'

import { requireAdmin } from '@/lib/auth/requireAdmin'
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
  await requireAdmin()

  const { data: job, error: jobError } = await supabaseAdmin
    .from('jobs')
    .select('id, status, drive_file_id, drive_deleted_at, youtube_retry_count, instagram_retry_count')
    .eq('id', jobId)
    .single()

  if (jobError || !job) {
    return { success: false, error: 'Job not found' }
  }

  const retryableStatuses = ['failed', 'needs_manual_review', 'awaiting_verification', 'ready_to_upload']
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
  await requireAdmin()

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

/** Mark job ignored (DB-only; no worker required). */
export async function markJobIgnored(jobId: string) {
  await requireAdmin()

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
