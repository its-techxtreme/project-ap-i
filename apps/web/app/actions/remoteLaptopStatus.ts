'use server'

import { parseRemoteLaptopStatus, type RemoteLaptopStatus } from '@/lib/admin/remoteLaptopStatus'
import { getUserRole } from '@/lib/auth/getUserRole'
import { supabaseAdmin } from '@/lib/supabase/admin'

const HEARTBEAT_KEY = 'worker_heartbeat'

/**
 * Read-only laptop presence for the admin topbar.
 * Uses Supabase heartbeat written by the local worker (never exposes worker URLs).
 */
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
