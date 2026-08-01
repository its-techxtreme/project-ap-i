/**
 * One-shot: regenerate metadata for interrupted anime job and requeue upload.
 * Usage: pnpm --filter @project-api/worker exec tsx --env-file=../../.env scripts/resume-4bdf-metadata.ts
 */
import { createClient } from '@supabase/supabase-js'

import { AiMetadataProvider } from '../src/metadata/AiMetadataProvider'
import { hasSpammyRepetition } from '../src/metadata/quality'

const JOB_ID = '4bdfbc37-a8ff-4b2f-a598-4a4c813ec828'

async function main() {
  const provider = new AiMetadataProvider()
  console.log('Generating metadata...')
  const meta = await provider.generate({
    jobId: JOB_ID,
    sourceUrl: 'https://www.instagram.com/reel/DY1ymkmtwom/',
    sourcePlatform: 'instagram',
    nicheSlug: 'anime',
    sourceTitle: 'When mc shows his power',
    sourceDescription:
      'When mc shows his power — anime clip energy, charged expression, quick edit beat.',
    creatorNotes:
      'On-screen text: When mc shows his power. Blue-haired anime character close-up. Short-form anime edit.',
  })

  console.log(
    JSON.stringify(
      {
        generatedBy: meta.generatedBy,
        provider: meta.provider,
        model: meta.model,
        title: meta.youtubeTitle,
        titleLen: meta.youtubeTitle.length,
        descLen: meta.youtubeDescription.length,
        captionLen: meta.instagramCaption.length,
        spam: hasSpammyRepetition(meta.youtubeDescription),
        descHead: meta.youtubeDescription.slice(0, 240),
      },
      null,
      2,
    ),
  )

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env')

  const sb = createClient(url, key, { auth: { persistSession: false } })
  const { data, error } = await sb
    .from('jobs')
    .update({
      youtube_title: meta.youtubeTitle,
      youtube_description: meta.youtubeDescription,
      instagram_caption: meta.instagramCaption,
      metadata_status: meta.generatedBy === 'ai' ? 'generated' : 'fallback_used',
      status: 'ready_to_upload',
      youtube_upload_status: 'pending',
      instagram_upload_status: 'pending',
      verification_status: 'pending',
      failure_code: null,
      failure_reason: null,
      locked_by: null,
      locked_at: null,
      lock_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', JOB_ID)
    .select('id, status, youtube_title, metadata_status')
    .single()

  if (error) {
    console.error('UPDATE_FAIL', error.message)
    process.exit(1)
  }
  console.log('JOB_READY', data)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
