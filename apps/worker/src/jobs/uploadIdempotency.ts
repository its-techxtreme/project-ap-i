import { supabaseAdmin } from '../db/supabaseAdmin'

import { isRealPlatformMediaId } from '../uploaders/platformMediaIds'

export type SuccessfulUploadRef = {
  platformUrl: string
  platformMediaId: string | null
  attemptId: string
}

/** Latest good upload_attempts row with a real URL. Skip Playwright if we already posted and the job status just drifted. */
export async function findSuccessfulUploadAttempt(
  jobId: string,
  platform: 'youtube' | 'instagram',
): Promise<SuccessfulUploadRef | null> {
  const { data } = await supabaseAdmin
    .from('upload_attempts')
    .select('id, platform_url, platform_media_id, status, finished_at')
    .eq('job_id', jobId)
    .eq('platform', platform)
    .in('status', ['uploaded', 'verified'])
    .order('finished_at', { ascending: false })
    .limit(12)

  for (const row of data ?? []) {
    const candidate = row.platform_url ?? row.platform_media_id
    if (isRealPlatformMediaId(platform, candidate)) {
      return {
        attemptId: row.id,
        platformUrl: (row.platform_url ?? row.platform_media_id) as string,
        platformMediaId: row.platform_media_id,
      }
    }
  }
  return null
}

/** True when Publish was clicked but no URL was captured — do not auto re-upload. */
export async function hasPublishWithoutUrlFailure(
  jobId: string,
  platform: 'youtube' | 'instagram',
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('upload_attempts')
    .select('error_message')
    .eq('job_id', jobId)
    .eq('platform', platform)
    .eq('status', 'failed')
    .order('finished_at', { ascending: false })
    .limit(8)

  return (data ?? []).some((row) => {
    const msg = (row.error_message ?? '').toLowerCase()
    return msg.includes('no video url was captured') || msg.includes('refusing synthetic media') || msg.includes('youtube_url_capture_failed')
  })
}
