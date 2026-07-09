import { createClient } from '@supabase/supabase-js'

import { AiMetadataProvider } from '../src/metadata/AiMetadataProvider'

async function main(): Promise<void> {
  const JOB_ID = '3385f350-67ff-44ce-b837-3b613c1949fe'

  const provider = new AiMetadataProvider()
  const meta = await provider.generate({
    jobId: JOB_ID,
    sourceUrl: 'https://www.instagram.com/reel/DaNNdpXILiR/',
    sourcePlatform: 'instagram',
    nicheSlug: 'anime',
  })

  console.log(
    JSON.stringify({
      generatedBy: meta.generatedBy,
      model: meta.model,
      title: meta.youtubeTitle,
      description: meta.youtubeDescription.slice(0, 120),
      caption: meta.instagramCaption.slice(0, 120),
    }),
  )

  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })

  const { error } = await sb
    .from('jobs')
    .update({
      youtube_title: meta.youtubeTitle,
      youtube_description: meta.youtubeDescription,
      instagram_caption: meta.instagramCaption,
      metadata_status: meta.generatedBy === 'ai' ? 'generated' : 'fallback_used',
      status: 'needs_manual_review',
      youtube_upload_status: 'failed',
      instagram_upload_status: 'failed',
      failure_reason: null,
      failure_code: null,
    })
    .eq('id', JOB_ID)

  if (error) {
    console.error(error.message)
    process.exit(1)
  }

  console.log('job metadata updated')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
