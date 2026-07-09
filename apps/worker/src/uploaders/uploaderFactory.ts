import { config } from '../config'

import { InstagramPlaywrightUploader } from './InstagramPlaywrightUploader'
import { MockUploader } from './MockUploader'
import type { PlatformUploader } from './types'
import { YoutubePlaywrightUploader } from './YoutubePlaywrightUploader'

export function createYoutubeUploader(): PlatformUploader {
  if (config.REAL_UPLOADS_ENABLED && config.YOUTUBE_UPLOADS_ENABLED) {
    return new YoutubePlaywrightUploader()
  }
  return new MockUploader()
}

export function createInstagramUploader(): PlatformUploader {
  if (config.REAL_UPLOADS_ENABLED && config.INSTAGRAM_UPLOADS_ENABLED) {
    return new InstagramPlaywrightUploader()
  }
  return new MockUploader()
}
