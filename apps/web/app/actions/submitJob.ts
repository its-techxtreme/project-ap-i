'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { SubmitJobSchema, validateSourceUrl } from '@project-api/shared'

import {
  checkSubmissionRateLimit,
  recordSubmission,
} from '@/lib/rate-limit/submission'
import { supabaseAdmin } from '@/lib/supabase/admin'

export type SubmitJobResult =
  | { success: true; jobId: string; publicJobCode: string | null; nicheLabel: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> }

function clientIpFromHeaders(h: Headers): string {
  const forwarded = h.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  const realIp = h.get('x-real-ip')?.trim()
  if (realIp) return realIp
  return 'unknown'
}

export async function submitJobAction(formData: unknown): Promise<SubmitJobResult> {
  const h = await headers()
  const rateKey = `ip:${clientIpFromHeaders(h)}`

  const rateLimit = checkSubmissionRateLimit(rateKey)
  if (!rateLimit.allowed) {
    return { success: false, error: rateLimit.error }
  }

  const parseResult = SubmitJobSchema.safeParse(formData)
  if (!parseResult.success) {
    return {
      success: false,
      error: 'Validation failed. Please check your inputs.',
      fieldErrors: parseResult.error.flatten().fieldErrors,
    }
  }

  const { sourceUrl, sourcePlatform, nicheId, rightsConfirmed } = parseResult.data

  const urlCheck = validateSourceUrl(sourceUrl)
  if (!urlCheck.valid) {
    return { success: false, error: urlCheck.error }
  }

  const { data: niche } = await supabaseAdmin
    .from('niches')
    .select('id, name, slug')
    .eq('id', nicheId)
    .eq('is_active', true)
    .single()

  if (!niche) {
    return { success: false, error: 'Selected niche is not available. Contact admin.' }
  }

  const { data: existing } = await supabaseAdmin
    .from('jobs')
    .select('id, status')
    .eq('normalized_source_url', urlCheck.normalizedUrl)
    .eq('niche_id', nicheId)
    .not('status', 'in', '("completed","ignored","failed")')
    .limit(1)
    .maybeSingle()

  if (existing) {
    return {
      success: false,
      error: 'This link has already been submitted for this niche and is being processed.',
    }
  }

  const { data: job, error: insertError } = await supabaseAdmin
    .from('jobs')
    .insert({
      submitted_by: null,
      source_url: urlCheck.normalizedUrl,
      normalized_source_url: urlCheck.normalizedUrl,
      source_platform: sourcePlatform,
      niche_id: nicheId,
      rights_confirmed: rightsConfirmed,
      status: 'queued',
    })
    .select('id, public_job_code')
    .single()

  if (insertError || !job) {
    console.error('[submitJob] Insert error:', insertError?.message)
    return { success: false, error: 'Submission failed. Please try again.' }
  }

  await supabaseAdmin.from('audit_logs').insert({
    actor_user_id: null,
    actor_type: 'anonymous',
    action: 'job_created',
    target_type: 'job',
    target_id: job.id,
    metadata: { niche: niche.slug, platform: sourcePlatform, rate_key: rateKey },
  })

  recordSubmission(rateKey)
  revalidatePath('/')

  return {
    success: true,
    jobId: job.id,
    publicJobCode: job.public_job_code,
    nicheLabel: niche.name,
  }
}
