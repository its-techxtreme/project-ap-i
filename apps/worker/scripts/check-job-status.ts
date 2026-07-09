import { createClient } from '@supabase/supabase-js'

async function main(): Promise<void> {
  const jobId = process.argv[2] ?? '3385f350-67ff-44ce-b837-3b613c1949fe'
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
  const { data, error } = await sb
    .from('jobs')
    .select(
      'id,status,youtube_upload_status,instagram_upload_status,youtube_retry_count,instagram_retry_count,youtube_title,instagram_caption,metadata_status,failure_code,failure_reason',
    )
    .eq('id', jobId)
    .single()
  console.log(JSON.stringify({ data, error }, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
