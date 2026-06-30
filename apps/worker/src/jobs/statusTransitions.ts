import type { JobStatus } from '@project-api/shared'

export const MOCK_PROCESS_STAGES = [
  { status: 'downloading' as JobStatus, stage: 'download', event: 'download_started' },
  { status: 'downloaded' as JobStatus, stage: 'download', event: 'download_completed' },
  { status: 'processing' as JobStatus, stage: 'process', event: 'processing_started' },
  { status: 'processed' as JobStatus, stage: 'process', event: 'processing_completed' },
] as const

export const MOCK_UPLOAD_FINAL_STATUS = 'awaiting_verification' as const
export const MOCK_VERIFY_FINAL_STATUS = 'completed' as const
