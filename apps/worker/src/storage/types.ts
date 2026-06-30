export interface DriveUploadInput {
  jobId: string
  nicheSlug: string
  localFilePath: string
  mimeType?: string
}

export interface DriveUploadOutput {
  fileId: string
  fileName: string
  viewUrl?: string
  folderState: 'processed_ready'
}

export interface DriveStorage {
  upload(input: DriveUploadInput): Promise<DriveUploadOutput>
  delete(fileId: string, jobId: string): Promise<void>
  moveToFailedFolder(fileId: string): Promise<void>
}
