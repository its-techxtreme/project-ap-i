import type { JobStatus, Platform, UploadStatus } from '@project-api/shared'

import { config } from '../config'
import { logger } from '../logging/logger'

import { supabaseAdmin } from './supabaseAdmin'

/** Raw job row shape returned by Supabase (snake_case). */
export interface DbJobRow {
  id: string
  public_job_code?: string | null
  submitted_by?: string | null
  source_url: string
  normalized_source_url?: string | null
  source_platform: Platform
  niche_id: string
  rights_confirmed: boolean
  status: JobStatus
  download_status: string
  processing_status: string
  metadata_status: string
  youtube_upload_status: UploadStatus
  instagram_upload_status: UploadStatus
  verification_status: string
  target_youtube_account_id?: string | null
  target_instagram_account_id?: string | null
  locked_by?: string | null
  locked_at?: string | null
  lock_expires_at?: string | null
  verification_due_at?: string | null
  retry_count: number
  youtube_retry_count: number
  instagram_retry_count: number
  created_at: string
  updated_at: string
  processed_at?: string | null
  uploaded_at?: string | null
  completed_at?: string | null
  drive_file_id?: string | null
  drive_file_name?: string | null
  drive_view_url?: string | null
  drive_folder_state?: string | null
  drive_deleted_at?: string | null
  youtube_title?: string | null
  youtube_description?: string | null
  instagram_caption?: string | null
  failure_code?: string | null
  failure_reason?: string | null
  /** Admin one-shot soft daily-limit bypass; cleared after upload accepts the job. */
  force_upload_override?: boolean | null
}

/** Supabase represents SQL NULL composite returns as an object of null fields. */
export function normalizeClaimRpcResult(data: unknown): DbJobRow | null {
  if (!data || typeof data !== 'object') return null
  const row = data as Record<string, unknown>
  if (typeof row.id !== 'string' || row.id.length === 0) return null
  return data as DbJobRow
}

/** Atomically claims the next queued job. Returns null if no job is available. */
export async function claimNextJob(workerId: string): Promise<DbJobRow | null> {
  const { data, error } = await supabaseAdmin.rpc('claim_next_job', {
    worker_id: workerId,
    lock_minutes: config.JOB_LOCK_MINUTES,
  })

  if (error) {
    logger.error({ msg: 'Failed to claim job', error: error.message })
    return null
  }

  return normalizeClaimRpcResult(data)
}

/** Strip characters that break PostgREST/Postgres JSON payloads (e.g. NUL). */
function sanitizeJobUpdateValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replaceAll('\u0000', '').normalize('NFC')
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeJobUpdateValue)
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeJobUpdateValue(v)
    }
    return out
  }
  return value
}

/** Updates the job status and optional extra columns. Throws on failure. */
export async function updateJobStatus(
  jobId: string,
  status: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  const payload = sanitizeJobUpdateValue({
    status,
    updated_at: new Date().toISOString(),
    ...(extra ?? {}),
  }) as Record<string, unknown>

  const { error } = await supabaseAdmin.from('jobs').update(payload).eq('id', jobId)

  if (error) {
    logger.error({ msg: 'Failed to update job status', jobId, error: error.message })
    throw new Error(`Failed to update job status: ${error.message}`)
  }
}

/** Writes a job event to the job_events table. */
export async function writeJobEvent(
  jobId: string,
  stage: string,
  eventType: string,
  message: string,
  severity: 'debug' | 'info' | 'warning' | 'error' = 'info',
  metadata?: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabaseAdmin.from('job_events').insert({
    job_id: jobId,
    stage,
    event_type: eventType,
    severity,
    message,
    metadata: metadata ?? null,
  })

  if (error) {
    logger.error({ msg: 'Failed to write job event', jobId, stage, error: error.message })
  }
}

/** Gets a single job by ID. */
export async function getJobById(jobId: string): Promise<DbJobRow | null> {
  const { data, error } = await supabaseAdmin.from('jobs').select('*').eq('id', jobId).single()
  if (error || !data) return null
  return data as DbJobRow
}

/** Resolves niche slug from niche_id. */
export async function getNicheSlugById(nicheId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.from('niches').select('slug').eq('id', nicheId).single()
  if (error || !data) return null
  return data.slug as string
}

export interface AuditLogInput {
  actorType: 'user' | 'admin' | 'worker' | 'system'
  action: string
  targetType?: string
  targetId?: string
  metadata?: Record<string, unknown>
}

/** Writes an audit log entry. */
export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  const { error } = await supabaseAdmin.from('audit_logs').insert({
    actor_type: input.actorType,
    action: input.action,
    target_type: input.targetType ?? null,
    target_id: input.targetId ?? null,
    metadata: input.metadata ?? null,
  })

  if (error) {
    logger.error({ msg: 'Failed to write audit log', action: input.action, error: error.message })
  }
}
