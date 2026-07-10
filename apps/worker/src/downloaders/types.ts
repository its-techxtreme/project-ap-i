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
  /** Source video title from yt-dlp (YouTube title / IG short title). */
  title?: string
  /** Source caption/description from yt-dlp (IG caption or YT description). */
  description?: string
  /** Channel / uploader display name when available. */
  uploader?: string
}

export interface Downloader {
  download(input: DownloadInput): Promise<DownloadOutput>
}
