import { config } from '../config'
import { updateJobStatus, writeJobEvent } from '../db/jobsRepo'

import {
  MOCK_PROCESS_STAGES,
  MOCK_UPLOAD_FINAL_STATUS,
  MOCK_VERIFY_FINAL_STATUS,
} from './statusTransitions'

export async function runMockProcess(jobId: string): Promise<string> {
  for (const stage of MOCK_PROCESS_STAGES) {
    await updateJobStatus(jobId, stage.status)
    await writeJobEvent(jobId, stage.stage, stage.event, `[MOCK] ${stage.event}`)
  }
  return 'processed'
}

export async function runMockUpload(jobId: string): Promise<string | { blocked: true }> {
  if (config.REAL_UPLOADS_ENABLED) {
    return { blocked: true }
  }

  await updateJobStatus(jobId, 'uploading', {
    youtube_upload_status: 'uploading',
    instagram_upload_status: 'uploading',
  })
  await writeJobEvent(jobId, 'upload', 'youtube_upload_started', '[MOCK] YouTube upload started')
  await writeJobEvent(jobId, 'upload', 'instagram_upload_started', '[MOCK] Instagram upload started')

  await updateJobStatus(jobId, MOCK_UPLOAD_FINAL_STATUS, {
    youtube_upload_status: 'uploaded',
    instagram_upload_status: 'uploaded',
    uploaded_at: new Date().toISOString(),
    verification_due_at: new Date(Date.now() + config.VERIFY_DELAY_MINUTES * 60_000).toISOString(),
  })

  return MOCK_UPLOAD_FINAL_STATUS
}

export async function runMockVerify(jobId: string): Promise<string> {
  await updateJobStatus(jobId, MOCK_VERIFY_FINAL_STATUS, {
    youtube_upload_status: 'verified',
    instagram_upload_status: 'verified',
    verification_status: 'verified',
    completed_at: new Date().toISOString(),
  })
  await writeJobEvent(jobId, 'verify', 'verification_completed', '[MOCK] Both platforms verified')
  return MOCK_VERIFY_FINAL_STATUS
}
