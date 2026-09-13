'use server'

import { revalidatePath } from 'next/cache'

import { requireAdminWrite } from '@/lib/auth/requireAdmin'
import { getAdminUsername } from '@/lib/auth/getUserRole'
import { COLLECTOR_ARMED_KEY } from '@/lib/admin/collectorCrew'
import { supabaseAdmin } from '@/lib/supabase/admin'

export type SetCollectorArmedResult =
  | { success: true; armed: boolean }
  | { success: false; error: string }

export async function setCollectorArmed(armed: boolean): Promise<SetCollectorArmedResult> {
  const writeGate = await requireAdminWrite()
  if (writeGate.denied) return { success: false, error: writeGate.error }

  const { error } = await supabaseAdmin.from('system_settings').upsert(
    {
      key: COLLECTOR_ARMED_KEY,
      value: armed,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  )

  if (error) {
    return { success: false, error: 'Could not update the collector switch.' }
  }

  await supabaseAdmin.from('audit_logs').insert({
    actor_type: 'admin',
    action: armed ? 'collector_armed' : 'collector_disarmed',
    target_type: 'system_settings',
    target_id: COLLECTOR_ARMED_KEY,
    metadata: { username: await getAdminUsername(), armed },
  })

  revalidatePath('/admin/collector')
  revalidatePath('/admin/settings')
  return { success: true, armed }
}
