/** Real media id means a clickable URL. Fake ig-<uuid>-<ts> / yt-<jobId>-<ts> after Share must not count as uploaded. */

/** YouTube video ids are 11 chars from [A-Za-z0-9_-]. */
const YT_VIDEO_ID = /([A-Za-z0-9_-]{11})/

/** Video id from watch/shorts/youtu.be/Studio. Studio often has /video/<id>/edit before share. */
export function extractYoutubeVideoId(text: string | null | undefined): string | undefined {
  if (!text) return undefined
  const patterns = [
    /youtu\.be\/([A-Za-z0-9_-]{11})/i,
    /youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/)([A-Za-z0-9_-]{11})/i,
    /studio\.youtube\.com\/video\/([A-Za-z0-9_-]{11})/i,
    /youtube\.com\/video\/([A-Za-z0-9_-]{11})/i,
  ]
  for (const re of patterns) {
    const match = text.match(re)
    if (match?.[1]) return match[1]
  }
  // Bare 11-char id only when the whole string is just the id.
  const bare = text.trim().match(new RegExp(`^${YT_VIDEO_ID.source}$`))
  return bare?.[1]
}

/** Canonical public watch URL used as platform_media_id. */
export function youtubeUrlFromVideoId(videoId: string): string {
  return `https://youtu.be/${videoId}`
}

export function normalizeYoutubeMediaUrl(href: string): string | null {
  const id = extractYoutubeVideoId(href)
  return id ? youtubeUrlFromVideoId(id) : null
}

export function isRealPlatformMediaId(
  platform: 'youtube' | 'instagram' | string,
  mediaId: string | null | undefined,
): boolean {
  if (!mediaId || !mediaId.trim()) return false
  const id = mediaId.trim()

  if (/^(ig|yt)-[0-9a-f-]{8,}-?\d*$/i.test(id)) return false
  if (/^(ig|yt)-[0-9a-z_-]+-\d{10,}$/i.test(id)) return false

  if (platform === 'youtube') {
    // Accept public watch/shorts/youtu.be and Studio `/video/<id>` (normalized to youtu.be).
    return Boolean(normalizeYoutubeMediaUrl(id))
  }
  if (platform === 'instagram') {
    // Accept both /reel/ID and /{username}/reel/ID (current Instagram web URLs).
    return /instagram\.com\/(?:[\w.]+\/)?(?:reel|p|tv)\//i.test(id)
  }
  return false
}

export function normalizeInstagramMediaUrl(href: string): string | null {
  const absolute = href.startsWith('http') ? href : `https://www.instagram.com${href}`
  // Instagram web now serves /{username}/reel/{code}/ as well as /reel/{code}/.
  if (!/instagram\.com\/(?:[\w.]+\/)?(?:reel|p|tv)\//i.test(absolute)) return null
  return absolute.split('?')[0].replace(/\/$/, '') + '/'
}
