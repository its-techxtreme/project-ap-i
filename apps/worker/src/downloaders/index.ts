import { config } from '../config'

import { MockDownloader } from './MockDownloader'
import { YtDlpDownloader } from './YtDlpDownloader'
import type { Downloader } from './types'

export function createDownloader(): Downloader {
  if (config.NODE_ENV === 'test' && !config.INTEGRATION_TESTS_ENABLED) {
    return new MockDownloader()
  }
  return new YtDlpDownloader()
}

export { MockDownloader, YtDlpDownloader }
export type { Downloader, DownloadInput, DownloadOutput } from './types'
