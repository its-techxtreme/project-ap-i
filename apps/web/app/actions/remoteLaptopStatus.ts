'use server'

import { parseRemoteLaptopStatus, type RemoteLaptopStatus } from '@/lib/admin/remoteLaptopStatus'
import { getUserRole } from '@/lib/auth/getUserRole'
import { supabaseAdmin } from '@/lib/supabase/admin'

const HEARTBEAT_KEY = 'worker_heartbeat'

/** Topbar laptop light. Reads worker heartbeat in Supabase. Never a worker URL. */
export async function getRemoteLaptopStatus(): Promise<RemoteLaptopStatus> {
  const role = await getUserRole()
  if (role !== 'admin' && role !== 'demo') {
    return {
      state: 'offline',
      label: 'Remote laptop offline',
      shortLabel: 'Laptop offline',
      detail: 'Not authorized',
      lastSeenAt: null,
      ok: null,
    }
  }

  const { data, error } = await supabaseAdmin
    .from('system_settings')
    .select('value')
    .eq('key', HEARTBEAT_KEY)
    .maybeSingle()

  if (error) {
    return {
      state: 'offline',
      label: 'Remote laptop offline',
      shortLabel: 'Laptop offline',
      detail: 'Status unavailable',
      lastSeenAt: null,
      ok: null,
    }
  }

  return parseRemoteLaptopStatus(data?.value ?? null)
}
