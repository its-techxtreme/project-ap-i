import { describe, expect, it } from 'vitest'

import { pickLatestSuccessfulUpload, resolveUploadHref } from '@/lib/format/uploadRefs'

describe('uploadRefs', () => {
  it('resolveUploadHref prefers platform_url then media id URL', () => {
    expect(
      resolveUploadHref({
        platform_url: 'https://www.youtube.com/watch?v=abc',
        platform_media_id: 'ignored',
      }),
    ).toBe('https://www.youtube.com/watch?v=abc')

    expect(
      resolveUploadHref({
        platform_url: null,
        platform_media_id: 'https://www.instagram.com/reel/xyz/',
      }),
    ).toBe('https://www.instagram.com/reel/xyz/')

    expect(resolveUploadHref({ platform_url: null, platform_media_id: 'ig-fake' })).toBeNull()
  })

  it('pickLatestSuccessfulUpload prefers uploaded attempt with real URL', () => {
    const attempts = [
      {
        platform: 'instagram',
        status: 'failed',
        platform_media_id: 'ig-old',
        platform_url: null,
      },
      {
        platform: 'instagram',
        status: 'uploaded',
        platform_media_id: 'https://www.instagram.com/p/ABC/',
        platform_url: 'https://www.instagram.com/p/ABC/',
      },
      {
        platform: 'youtube',
        status: 'uploaded',
        platform_media_id: 'https://www.youtube.com/watch?v=yt1',
        platform_url: null,
      },
    ]

    expect(pickLatestSuccessfulUpload(attempts, 'instagram')?.platform_media_id).toContain('/p/ABC/')
    expect(pickLatestSuccessfulUpload(attempts, 'youtube')?.platform_media_id).toContain('watch?v=yt1')
  })
})
