import { logger } from '../logging/logger'

import { supabaseAdmin } from './supabaseAdmin'

export type AdminCommandType = 'retry_upload' | 'delete_drive_file'
export type AdminCommandStatus = 'pending' | 'claimed' | 'done' | 'failed'

export interface DbAdminCommandRow {
  id: string
  job_id: string
  command: AdminCommandType
  status: AdminCommandStatus
  requested_by: string | null
  payload: Record<string, unknown>
  error: string | null
  claimed_by: string | null
  claimed_at: string | null
  lock_expires_at: string | null
  processed_at: string | null
  created_at: string
  updated_at: string
}

/** Supabase represents SQL NULL composite returns as an object of null fields. */
export function normalizeAdminCommandClaim(data: unknown): DbAdminCommandRow | null {
  if (!data || typeof data !== 'object') return null
  const row = data as Record<string, unknown>
  if (typeof row.id !== 'string' || row.id.length === 0) return null
  return data as DbAdminCommandRow
}

export async function claimNextAdminCommand(
  workerId: string,
  lockMinutes = 15,
): Promise<DbAdminCommandRow | null> {
  const { data, error } = await supabaseAdmin.rpc('claim_next_admin_command', {
    worker_id: workerId,
    lock_minutes: lockMinutes,
  })

  if (error) {
    logger.error({ msg: 'Failed to claim admin command', error: error.message })
    return null
  }

  return normalizeAdminCommandClaim(data)
}

export async function markAdminCommandDone(commandId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('admin_commands')
    .update({
      status: 'done',
      processed_at: new Date().toISOString(),
      error: null,
    })
    .eq('id', commandId)

  if (error) {
    logger.error({ msg: 'Failed to mark admin command done', commandId, error: error.message })
  }
}

export async function markAdminCommandFailed(commandId: string, errorMessage: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('admin_commands')
    .update({
      status: 'failed',
      processed_at: new Date().toISOString(),
      error: errorMessage.slice(0, 2000),
    })
    .eq('id', commandId)

  if (error) {
    logger.error({
      msg: 'Failed to mark admin command failed',
      commandId,
      error: error.message,
    })
  }
}
