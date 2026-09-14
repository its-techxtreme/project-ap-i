/** Rewrite clip metadata for a job that still has Drive media then park ready_to_upload. */
import { spawnSync } from 'node:child_process'

import { createClient } from '@supabase/supabase-js'

import { getFallbackMetadata } from '../src/metadata/fallbacks'
import { AiMetadataProvider } from '../src/metadata/AiMetadataProvider'
import { hasPipelineBoilerplate, hasSpammyRepetition } from '../src/metadata/quality'
import { resolveBinary } from '../src/utils/resolveBinary'

async function fetchYtDlpCaption(url: string): Promise<{ title?: string; description?: string }> {
  const bin = await resolveBinary('yt-dlp')
  const cleanUrl = url.split('?')[0]
  const result = spawnSync(bin, ['--print', '%(title)s|||%(description)s', '--no-download', cleanUrl], {
    encoding: 'utf8',
    timeout: 120_000,
    windowsHide: true,
  })
  if (result.error) {
    console.warn('yt-dlp spawn error', result.error.message)
  }
  if (result.status !== 0) {
    console.warn('yt-dlp stderr', (result.stderr || '').slice(0, 500))
  }
  const combined = `${result.stdout || ''}\n${result.stderr || ''}`
  const line = combined
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.includes('|||'))
    .pop()
  if (!line) {
    console.warn('yt-dlp produced no title|||description line', {
      status: result.status,
      stdoutLen: (result.stdout || '').length,
      stderrLen: (result.stderr || '').length,
    })
    return {}
  }
  const [title, ...rest] = line.split('|||')
  return { title: title?.trim() || undefined, description: rest.join('|||').trim() || undefined }
}

async function main(): Promise<void> {
  const jobId = process.argv[2]
  if (!jobId) {
    console.error('Usage: regen-job-metadata.ts <jobId>')
    process.exit(1)
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env')

  const sb = createClient(url, key, { auth: { persistSession: false } })
  const { data: job, error } = await sb
    .from('jobs')
    .select('id, source_url, source_platform, niche_id, drive_file_id, status')
    .eq('id', jobId)
    .single()
  if (error || !job) throw new Error(error?.message ?? 'Job not found')

  const { data: niche } = await sb.from('niches').select('slug').eq('id', job.niche_id).single()
  const nicheSlug = niche?.slug ?? 'memes'

  console.log('Fetching source caption via yt-dlp...')
  const scraped = await fetchYtDlpCaption(job.source_url)
  console.log('scraped', {
    title: scraped.title?.slice(0, 80),
    descLen: scraped.description?.length ?? 0,
    descHead: scraped.description?.slice(0, 120),
  })

  let meta
  try {
    const provider = new AiMetadataProvider()
    meta = await provider.generate({
      jobId,
      sourceUrl: job.source_url,
      sourcePlatform: job.source_platform,
      nicheSlug,
      sourceTitle: scraped.title,
      sourceDescription: scraped.description,
    })
  } catch (err) {
    console.warn('AI path failed, using fallback', err)
    meta = getFallbackMetadata(nicheSlug, {
      title: scraped.title,
      description: scraped.description,
      sourceUrl: job.source_url,
      sourcePlatform: job.source_platform,
    })
  }

  if (hasPipelineBoilerplate(meta.youtubeDescription) || hasSpammyRepetition(meta.youtubeDescription)) {
    console.warn('AI/fallback still looked bad — forcing content fallback')
    meta = getFallbackMetadata(nicheSlug, {
      title: scraped.title,
      description: scraped.description,
      sourceUrl: job.source_url,
      sourcePlatform: job.source_platform,
    })
  }

  console.log(
    JSON.stringify(
      {
        generatedBy: meta.generatedBy,
        title: meta.youtubeTitle,
        titleLen: meta.youtubeTitle.length,
        descLen: meta.youtubeDescription.length,
        descHead: meta.youtubeDescription.slice(0, 280),
        pipelineBoilerplate: hasPipelineBoilerplate(meta.youtubeDescription),
      },
      null,
      2,
    ),
  )

  const patch: Record<string, unknown> = {
    youtube_title: meta.youtubeTitle,
    youtube_description: meta.youtubeDescription,
    instagram_caption: meta.instagramCaption,
    metadata_status: meta.generatedBy === 'ai' ? 'generated' : 'fallback_used',
    failure_code: null,
    failure_reason: null,
    locked_by: null,
    locked_at: null,
    lock_expires_at: null,
    updated_at: new Date().toISOString(),
  }

  if (job.drive_file_id) {
    patch.status = 'ready_to_upload'
    patch.youtube_upload_status = 'pending'
    patch.instagram_upload_status = 'pending'
    patch.verification_status = 'pending'
  }

  const { data, error: upErr } = await sb.from('jobs').update(patch).eq('id', jobId).select('id,status,youtube_title').single()
  if (upErr) throw new Error(upErr.message)
  console.log('JOB_UPDATED', data)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
