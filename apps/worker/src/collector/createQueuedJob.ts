import { prepareSourceIngest } from '@project-api/shared'
import type { NicheSlug, Platform } from '@project-api/shared'

type SupabaseLike = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

export type CreateQueuedJobInput = {
  sourceUrl: string
  nicheId: string
  intake: 'website' | 'collector_dm' | 'collector_search' | 'collector_admin_confirm'
  senderUsername?: string | null
  extraAudit?: Record<string, unknown>
}

export type CreateQueuedJobResult =
  | {
      success: true
      jobId: string
      publicJobCode: string | null
      nicheLabel: string
      nicheSlug: string
      platform: Platform
      duplicate: false
    }
  | { success: false; error: string; duplicate?: boolean }

export async function createQueuedJob(
  supabase: SupabaseLike,
  input: CreateQueuedJobInput,
): Promise<CreateQueuedJobResult> {
  const prepared = prepareSourceIngest(input.sourceUrl)
  if (!prepared.ok) return { success: false, error: prepared.error }

  const { data: niche } = await supabase
    .from('niches')
    .select('id, name, slug')
    .eq('id', input.nicheId)
    .eq('is_active', true)
    .single()

  if (!niche) {
    return { success: false, error: 'Selected niche is not available. Contact admin.' }
  }

  const { data: existing } = await supabase
    .from('jobs')
    .select('id, status')
    .eq('normalized_source_url', prepared.normalizedUrl)
    .eq('niche_id', input.nicheId)
    .not('status', 'in', '("completed","ignored","failed","cancelled")')
    .limit(1)
    .maybeSingle()

  if (existing) {
    return {
      success: false,
      error: 'This link has already been submitted for this niche and is being processed.',
      duplicate: true,
    }
  }

  const { data: job, error: insertError } = await supabase
    .from('jobs')
    .insert({
      submitted_by: null,
      source_url: prepared.normalizedUrl,
      normalized_source_url: prepared.normalizedUrl,
      source_platform: prepared.platform,
      niche_id: input.nicheId,
      rights_confirmed: true,
      status: 'queued',
    })
    .select('id, public_job_code')
    .single()

  if (insertError || !job) {
    return { success: false, error: 'Submission failed. Please try again.' }
  }

  await supabase.from('audit_logs').insert({
    actor_user_id: null,
    actor_type: input.intake === 'website' ? 'anonymous' : 'worker',
    action: 'job_created',
    target_type: 'job',
    target_id: job.id,
    metadata: {
      niche: niche.slug as NicheSlug,
      platform: prepared.platform,
      intake: input.intake,
      sender: input.senderUsername ?? null,
      ...input.extraAudit,
    },
  })

  return {
    success: true,
    jobId: job.id,
    publicJobCode: job.public_job_code,
    nicheLabel: niche.name,
    nicheSlug: niche.slug,
    platform: prepared.platform,
    duplicate: false,
  }
}

export async function resolveActiveNicheIdBySlug(
  supabase: SupabaseLike,
  slug: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('niches')
    .select('id')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()
  return data?.id ?? null
}
