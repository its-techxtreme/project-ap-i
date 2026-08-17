import {
  extractInstagramReelUrls,
  parseCollectorNiche,
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

export async function persistCollectedReels(items: CollectedReel[]): Promise<PersistResult> {
  const result: PersistResult = { queued: 0, pendingNiche: 0, duplicate: 0, invalid: 0 }

  for (const item of items) {
    const prepared = prepareSourceIngest(item.sourceUrl)
    if (!prepared.ok || prepared.platform !== 'instagram') {
      result.invalid += 1
      continue
    }

    const { data: existingItem } = await supabaseAdmin
      .from('collector_inbox_items')
      .select('id, status')
      .eq('normalized_source_url', prepared.normalizedUrl)
      .maybeSingle()

    if (existingItem) {
      result.duplicate += 1
      continue
    }

    const nicheSlug = parseCollectorNiche(item.nearbyText)

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
        await insertInboxRow({
          preparedUrl: prepared.normalizedUrl,
          item,
          status: created.duplicate ? 'duplicate' : 'invalid',
          nicheSlug,
          skipReason: created.error,
        })
        if (created.duplicate) result.duplicate += 1
        else result.invalid += 1
        continue
      }

      await insertInboxRow({
        preparedUrl: prepared.normalizedUrl,
        item,
        status: 'queued',
        nicheSlug,
        jobId: created.jobId,
      })
      result.queued += 1
      logger.info({
        msg: 'Collector queued reel',
        jobId: created.jobId,
        nicheSlug,
        sender: item.senderUsername,
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
