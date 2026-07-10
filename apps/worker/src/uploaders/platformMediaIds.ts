/**
 * Real platform media identifiers must be navigable URLs.
 * Legacy Playwright uploaders invented `ig-<uuid>-<ts>` / `yt-<jobId>-<ts>`
 * placeholders after clicking Share/Publish — those must never count as success.
 */
export function isRealPlatformMediaId(
  platform: 'youtube' | 'instagram' | string,
  mediaId: string | null | undefined,
): boolean {
  if (!mediaId || !mediaId.trim()) return false
  const id = mediaId.trim()

  if (/^(ig|yt)-[0-9a-f-]{8,}-?\d*$/i.test(id)) return false
  if (/^(ig|yt)-[0-9a-z_-]+-\d{10,}$/i.test(id)) return false

  if (platform === 'youtube') {
    return /youtu\.be\/|youtube\.com\/(watch|shorts)/i.test(id)
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
