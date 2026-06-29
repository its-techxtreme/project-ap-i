'use server'

export async function retryJobUpload(jobId: string) {
  void jobId
  return { success: false, error: 'Retry not yet implemented. Coming in Phase 11.' }
}

export async function deleteDriveFile(jobId: string) {
  void jobId
  return { success: false, error: 'Drive delete not yet implemented. Coming in Phase 11.' }
}

export async function markJobIgnored(jobId: string) {
  void jobId
  return { success: false, error: 'Mark ignored not yet implemented. Coming in Phase 11.' }
}
