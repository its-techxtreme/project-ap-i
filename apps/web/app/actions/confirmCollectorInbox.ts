'use server'

import { revalidatePath } from 'next/cache'
import { isNicheSlug } from '@project-api/shared'

import { requireAdminWrite } from '@/lib/auth/requireAdmin'
import { getAdminUsername } from '@/lib/auth/getUserRole'
import { createQueuedJob, resolveActiveNicheIdBySlug } from '@/lib/data/createQueuedJob'
import { supabaseAdmin } from '@/lib/supabase/admin'

export type ConfirmCollectorInboxResult =
  | { success: true; jobId: string }
  | { success: false; error: string }

export async function confirmCollectorInboxItem(
  inboxId: string,
  nicheSlug: string,
): Promise<ConfirmCollectorInboxResult> {
  const writeGate = await requireAdminWrite()
  if (writeGate.denied) return { success: false, error: writeGate.error }

  if (!inboxId || typeof inboxId !== 'string') {
    return { success: false, error: 'Inbox item not found' }
  }
  if (!isNicheSlug(nicheSlug)) {
    return { success: false, error: 'Pick Memes, Anime, or Sports.' }
  }

  const { data: item, error: fetchError } = await supabaseAdmin
    .from('collector_inbox_items')
    .select('id, status, normalized_source_url, sender_username')
    .eq('id', inboxId)
    .maybeSingle()

  if (fetchError || !item) {
    return { success: false, error: 'Inbox item not found' }
  }
  if (item.status !== 'pending_niche') {
    return { success: false, error: 'This reel is no longer waiting for a niche.' }
  }

  const nicheId = await resolveActiveNicheIdBySlug(supabaseAdmin, nicheSlug)
  if (!nicheId) {
    return { success: false, error: 'Selected niche is not available. Contact admin.' }
  }

  const created = await createQueuedJob(supabaseAdmin, {
    sourceUrl: item.normalized_source_url,
    nicheId,
    intake: 'collector_admin_confirm',
    senderUsername: item.sender_username,
    extraAudit: {
      inbox_id: inboxId,
      confirmed_by: await getAdminUsername(),
    },
  })

  if (!created.success) {
    await supabaseAdmin
      .from('collector_inbox_items')
      .update({
        status: created.duplicate ? 'duplicate' : 'invalid',
        skip_reason: created.error,
        niche_slug: nicheSlug,
        updated_at: new Date().toISOString(),
      })
      .eq('id', inboxId)
    return { success: false, error: created.error }
  }

  const { error: updateError } = await supabaseAdmin
    .from('collector_inbox_items')
    .update({
      status: 'queued',
      niche_slug: nicheSlug,
      job_id: created.jobId,
      skip_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', inboxId)

  if (updateError) {
    return { success: false, error: 'Job queued, but inbox row failed to update.' }
  }

  revalidatePath('/admin/collector')
  revalidatePath('/admin/jobs')
  return { success: true, jobId: created.jobId }
}

export type RejectCollectorInboxResult = { success: true } | { success: false; error: string }

export async function rejectCollectorInboxItem(inboxId: string): Promise<RejectCollectorInboxResult> {
  const writeGate = await requireAdminWrite()
  if (writeGate.denied) return { success: false, error: writeGate.error }

  if (!inboxId || typeof inboxId !== 'string') {
    return { success: false, error: 'Inbox item not found' }
  }

  const { data: item, error: fetchError } = await supabaseAdmin
    .from('collector_inbox_items')
    .select('id, status, normalized_source_url')
    .eq('id', inboxId)
    .maybeSingle()

  if (fetchError || !item) {
    return { success: false, error: 'Inbox item not found' }
  }
  if (item.status !== 'pending_niche') {
    return { success: false, error: 'This reel is no longer waiting for a niche.' }
  }

  const { error: updateError } = await supabaseAdmin
    .from('collector_inbox_items')
    .update({
      status: 'invalid',
      skip_reason: 'admin_rejected',
      updated_at: new Date().toISOString(),
    })
    .eq('id', inboxId)

  if (updateError) {
    return { success: false, error: 'Could not reject this reel.' }
  }

  await supabaseAdmin.from('audit_logs').insert({
    actor_type: 'admin',
    action: 'collector_inbox_rejected',
    target_type: 'collector_inbox_item',
    target_id: inboxId,
    metadata: {
      username: await getAdminUsername(),
      url: item.normalized_source_url,
    },
  })

  revalidatePath('/admin/collector')
  return { success: true }
}
