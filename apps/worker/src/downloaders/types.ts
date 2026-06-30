export interface DownloadInput {
  sourceUrl: string
  jobId: string
  tempDir: string
  sourcePlatform: 'youtube' | 'instagram'
}

export interface DownloadOutput {
  localPath: string
  fileSize: number
  duration?: number
  title?: string
}

export interface Downloader {
  download(input: DownloadInput): Promise<DownloadOutput>
}
