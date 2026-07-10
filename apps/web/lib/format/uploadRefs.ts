/** Prefer a real http(s) URL from platform_url or platform_media_id. */
export function resolveUploadHref(input: {
  platform_url?: string | null
  platform_media_id?: string | null
}): string | null {
  for (const candidate of [input.platform_url, input.platform_media_id]) {
    if (!candidate) continue
    const trimmed = candidate.trim()
    if (/^https?:\/\//i.test(trimmed)) return trimmed
  }
  return null
}

export function pickLatestSuccessfulUpload<
  T extends {
    platform: string
    status: string
    platform_url?: string | null
    platform_media_id?: string | null
  },
>(attempts: T[], platform: 'youtube' | 'instagram'): T | undefined {
  const forPlatform = attempts.filter((a) => a.platform === platform)
  const withUrl = forPlatform.find(
    (a) => a.status === 'uploaded' && resolveUploadHref(a) !== null,
  )
  return withUrl ?? forPlatform[0]
}
