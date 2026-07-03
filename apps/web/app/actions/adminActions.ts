'use server'

import { requireAdmin } from '@/lib/auth/requireAdmin'
import { supabaseAdmin } from '@/lib/supabase/admin'

const WORKER_BASE_URL = process.env.WORKER_BASE_URL!
const WORKER_INTERNAL_TOKEN = process.env.WORKER_INTERNAL_TOKEN!

// Real retry: POST to worker /jobs/:id/retry-upload
export async function retryJobUpload(jobId: string) {
  await requireAdmin()

  // 1. Verify job exists and is in retryable state
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

  // 2. POST to WORKER_BASE_URL/jobs/:id/retry-upload with worker token
  const response = await fetch(`${WORKER_BASE_URL}/jobs/${jobId}/retry-upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Worker-Token': WORKER_INTERNAL_TOKEN,
    },
  })

  const result = await response.json()

  if (!response.ok) {
    return { success: false, error: result.error ?? 'Retry failed' }
  }

  // 3. Write audit log: manual_retry_requested
  await supabaseAdmin.from('audit_logs').insert({
    actor_type: 'admin',
    action: 'manual_retry_requested',
    target_type: 'job',
    target_id: jobId,
    metadata: { status_before: job.status, retry_counts: { youtube: job.youtube_retry_count, instagram: job.instagram_retry_count } },
  })

  // 4. Return result
  return { success: true, jobId, result }
}

// Real delete: POST to worker /jobs/:id/delete-drive-file
export async function deleteDriveFile(jobId: string) {
  await requireAdmin()

  // 1. Verify job exists and has drive_file_id
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

  // Check status allows deletion
  const deletableStatuses = ['failed', 'needs_manual_review', 'completed']
  if (!deletableStatuses.includes(job.status)) {
    return { success: false, error: `Drive delete not allowed for job status: ${job.status}` }
  }

  // 2. POST to WORKER_BASE_URL/jobs/:id/delete-drive-file with worker token
  const response = await fetch(`${WORKER_BASE_URL}/jobs/${jobId}/delete-drive-file`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Worker-Token': WORKER_INTERNAL_TOKEN,
    },
  })

  const result = await response.json()

  if (!response.ok) {
    return { success: false, error: result.error ?? 'Drive delete failed' }
  }

  // 3. Write audit log: drive_delete_requested
  await supabaseAdmin.from('audit_logs').insert({
    actor_type: 'admin',
    action: 'drive_delete_requested',
    target_type: 'job',
    target_id: jobId,
    metadata: { drive_file_id: job.drive_file_id, status: job.status },
  })

  // 4. Return result
  return { success: true, jobId, driveFileId: result.driveFileId }
}

// Mark job ignored
export async function markJobIgnored(jobId: string) {
  await requireAdmin()

  // 1. Update job status to 'ignored'
  const { error: updateError } = await supabaseAdmin
    .from('jobs')
    .update({ status: 'ignored', updated_at: new Date().toISOString() })
    .eq('id', jobId)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  // 2. Write audit log: job_marked_ignored
  await supabaseAdmin.from('audit_logs').insert({
    actor_type: 'admin',
    action: 'job_marked_ignored',
    target_type: 'job',
    target_id: jobId,
    metadata: {},
  })

  return { success: true, jobId }
}