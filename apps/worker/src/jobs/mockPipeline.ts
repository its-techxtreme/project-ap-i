import { updateJobStatus, writeJobEvent } from '../db/jobsRepo'

import { MOCK_PROCESS_STAGES, MOCK_VERIFY_FINAL_STATUS } from './statusTransitions'

export async function runMockProcess(jobId: string): Promise<string> {
  for (const stage of MOCK_PROCESS_STAGES) {
    await updateJobStatus(jobId, stage.status)
    await writeJobEvent(jobId, stage.stage, stage.event, `[MOCK] ${stage.event}`)
  }
  return 'processed'
}

export { runUpload as runMockUpload } from './runUpload'

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
