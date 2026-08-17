'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { SubmitJobSchema, validateSourceUrl } from '@project-api/shared'

import {
  checkSubmissionRateLimit,
  recordSubmission,
} from '@/lib/rate-limit/submission'
import { createQueuedJob } from '@/lib/data/createQueuedJob'
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
  if (!rightsConfirmed) {
    return { success: false, error: 'You must confirm rights permission before submitting.' }
  }

  const urlCheck = validateSourceUrl(sourceUrl)
  if (!urlCheck.valid) {
    return { success: false, error: urlCheck.error }
  }

  const created = await createQueuedJob(supabaseAdmin, {
    sourceUrl,
    nicheId,
    intake: 'website',
    extraAudit: { rate_key: rateKey, platform: sourcePlatform },
  })

  if (!created.success) {
    return { success: false, error: created.error }
  }

  recordSubmission(rateKey)
  revalidatePath('/')

  return {
    success: true,
    jobId: created.jobId,
    publicJobCode: created.publicJobCode,
    nicheLabel: created.nicheLabel,
  }
}
