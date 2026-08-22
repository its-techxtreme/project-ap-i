import {
  extractInstagramReelUrls,
  instagramShortcodeFromUrl,
  pickNicheFromFollowingText,
  prepareSourceIngest,
  type NicheSlug,
} from '@project-api/shared'

import { supabaseAdmin } from '../db/supabaseAdmin'
import { logger } from '../logging/logger'

import { createQueuedJob, resolveActiveNicheIdBySlug } from './createQueuedJob'

export type CollectedReel = {
  sourceUrl: string
  nearbyText: string
  senderUsername: string | null
  threadId: string | null
}

export type PersistResult = {
  queued: number
  pendingNiche: number
  duplicate: number
  invalid: number
}

export function isCollectorDirectThread(threadId: string | null | undefined): boolean {
  return typeof threadId === 'string' && /\/direct\/t\/\d{6,}/.test(threadId)
}

export async function rejectBogusCollectorInboxItems(): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('collector_inbox_items')
    .select('id, normalized_source_url')
    .eq('status', 'pending_niche')

  if (error || !data?.length) return 0

  let rejected = 0
  for (const row of data) {
    if (instagramShortcodeFromUrl(row.normalized_source_url)) continue
    const { error: updateError } = await supabaseAdmin
      .from('collector_inbox_items')
      .update({
        status: 'invalid',
        skip_reason: 'implausible_shortcode',
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
    if (!updateError) rejected += 1
  }

  if (rejected > 0) {
    logger.info({ msg: 'Collector rejected bogus inbox items', count: rejected })
  }
  return rejected
}

export async function persistCollectedReels(items: CollectedReel[]): Promise<PersistResult> {
  const result: PersistResult = { queued: 0, pendingNiche: 0, duplicate: 0, invalid: 0 }

  for (const item of items) {
    const prepared = prepareSourceIngest(item.sourceUrl)
    if (!prepared.ok || prepared.platform !== 'instagram') {
      result.invalid += 1
      continue
    }

    if (!instagramShortcodeFromUrl(prepared.normalizedUrl) || !isCollectorDirectThread(item.threadId)) {
      result.invalid += 1
      logger.info({
        msg: 'Collector skipped non-DM or implausible reel URL',
        url: prepared.normalizedUrl,
        threadId: item.threadId,
      })
      continue
    }

    const { data: existingItem } = await supabaseAdmin
      .from('collector_inbox_items')
      .select('id, status')
      .eq('normalized_source_url', prepared.normalizedUrl)
      .maybeSingle()

    const nicheSlug = pickNicheFromFollowingText(item.nearbyText)

    if (existingItem?.status === 'queued' || existingItem?.status === 'duplicate') {
      result.duplicate += 1
      continue
    }

    if (existingItem && existingItem.status !== 'pending_niche') {
      result.duplicate += 1
      continue
    }

    if (existingItem?.status === 'pending_niche' && !nicheSlug) {
      result.duplicate += 1
      continue
    }

    if (nicheSlug) {
      const nicheId = await resolveActiveNicheIdBySlug(supabaseAdmin, nicheSlug)
      if (!nicheId) {
        await insertInboxRow({
          preparedUrl: prepared.normalizedUrl,
          item,
          status: 'invalid',
          nicheSlug,
          skipReason: 'niche_not_configured',
        })
        result.invalid += 1
        continue
      }

      const created = await createQueuedJob(supabaseAdmin, {
        sourceUrl: prepared.normalizedUrl,
        nicheId,
        intake: 'collector_dm',
        senderUsername: item.senderUsername,
      })

      if (!created.success) {
        if (!existingItem) {
          await insertInboxRow({
            preparedUrl: prepared.normalizedUrl,
            item,
            status: created.duplicate ? 'duplicate' : 'invalid',
            nicheSlug,
            skipReason: created.error,
          })
        }
        if (created.duplicate) result.duplicate += 1
        else result.invalid += 1
        continue
      }

      if (existingItem) {
        await supabaseAdmin
          .from('collector_inbox_items')
          .update({
            status: 'queued',
            niche_slug: nicheSlug,
            job_id: created.jobId,
            skip_reason: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingItem.id)
      } else {
        await insertInboxRow({
          preparedUrl: prepared.normalizedUrl,
          item,
          status: 'queued',
          nicheSlug,
          jobId: created.jobId,
        })
      }
      result.queued += 1
    logger.info({
      msg: 'Collector queued reel',
      jobId: created.jobId,
      nicheSlug,
      sender: item.senderUsername,
      nearbyText: item.nearbyText.slice(0, 120),
    })
      continue
    }

    await insertInboxRow({
      preparedUrl: prepared.normalizedUrl,
      item,
      status: 'pending_niche',
      nicheSlug: null,
    })
    result.pendingNiche += 1
    logger.info({
      msg: 'Collector stored reel pending niche',
      url: prepared.normalizedUrl,
      sender: item.senderUsername,
      nearbyText: item.nearbyText.slice(0, 120),
    })
  }

  return result
}

async function insertInboxRow(opts: {
  preparedUrl: string
  item: CollectedReel
  status: 'pending_niche' | 'queued' | 'duplicate' | 'invalid'
  nicheSlug: NicheSlug | null
  jobId?: string
  skipReason?: string
}): Promise<void> {
  const { error } = await supabaseAdmin.from('collector_inbox_items').insert({
    normalized_source_url: opts.preparedUrl,
    source_url: opts.preparedUrl,
    sender_username: opts.item.senderUsername,
    thread_id: opts.item.threadId,
    niche_slug: opts.nicheSlug,
    status: opts.status,
    job_id: opts.jobId ?? null,
    skip_reason: opts.skipReason ?? null,
    updated_at: new Date().toISOString(),
  })
  if (error && error.code !== '23505') {
    logger.warn({ msg: 'Collector inbox insert failed', error: error.message })
  }
}

export function collectReelsFromThreadHtml(html: string, nearbyText: string): string[] {
  const fromHtml = extractInstagramReelUrls(html)
  const fromText = extractInstagramReelUrls(nearbyText)
  return [...new Set([...fromHtml, ...fromText])]
}
