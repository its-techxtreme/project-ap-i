/** Delete leftover Drive staging on terminal jobs. Skip anything still in the pipeline. --dry-run from apps/worker. */
import { createClient } from '@supabase/supabase-js'

import { deleteJobDriveFile } from '../src/jobs/driveDelete'
import { createDriveStorage } from '../src/storage'

const ACTIVE_STATUSES = new Set([
  'queued',
  'locked',
  'validating',
  'downloading',
  'downloaded',
  'processing',
  'processed',
  'staging_to_drive',
  'ready_to_upload',
  'uploading',
  'awaiting_verification',
])

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })

  const { data, error } = await sb
    .from('jobs')
    .select('id,status,drive_file_id,drive_folder_state,drive_deleted_at')
    .not('drive_file_id', 'is', null)
    .order('updated_at', { ascending: false })

  if (error) throw error

  const candidates = (data ?? []).filter(
    (j) =>
      j.drive_folder_state !== 'deleted' &&
      !j.drive_deleted_at &&
      !ACTIVE_STATUSES.has(j.status),
  )

  console.log(
    JSON.stringify({
      dryRun,
      withDrive: data?.length ?? 0,
      candidates: candidates.length,
      skippedActive: (data ?? []).filter((j) => ACTIVE_STATUSES.has(j.status)).length,
    }),
  )

  if (dryRun) {
    for (const j of candidates) {
      console.log(
        JSON.stringify({
          action: 'would_delete',
          id: j.id,
          status: j.status,
          drive_file_id: j.drive_file_id,
        }),
      )
    }
    return
  }

  const drive = createDriveStorage()
  let ok = 0
  let failed = 0

  for (const j of candidates) {
    try {
      const result = await deleteJobDriveFile(j.id, drive)
      ok += 1
      console.log(JSON.stringify({ action: 'deleted', id: j.id, driveFileId: result.driveFileId }))
    } catch (err) {
      failed += 1
      const msg = err instanceof Error ? err.message : String(err)
      console.error(JSON.stringify({ action: 'error', id: j.id, status: j.status, error: msg }))
    }
  }

  console.log(JSON.stringify({ done: true, ok, failed }))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
