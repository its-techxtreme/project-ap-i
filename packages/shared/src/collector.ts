import { NICHE_SLUGS, type NicheSlug, type Platform } from './constants'
import { detectPlatform, validateSourceUrl } from './urls'

const NICHE_ALIASES: Record<string, NicheSlug> = {
  memes: 'memes',
  meme: 'memes',
  anime: 'anime',
  sports: 'sports',
  sport: 'sports',
}

const REEL_HREF_RE =
  /(?:https?:\/\/(?:www\.)?instagram\.com)?\/(?:reel|reels|p)\/([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/gi

const ESCAPED_REEL_RE =
  /\\\/(?:reel|reels|p)\\\/([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/gi

const CLIP_CODE_RE =
  /"product_type"\s*:\s*"clips"[\s\S]{0,400}?"code"\s*:\s*"([A-Za-z0-9_-]{11})"/gi

/** Instagram media shortcodes are 11 characters. Longer strings are concatenated junk. */
export function isPlausibleInstagramShortcode(code: string): boolean {
  return /^[A-Za-z0-9_-]{11}$/.test(code)
}

export function instagramShortcodeFromUrl(url: string): string | null {
  try {
    const path = new URL(url).pathname
    const match = path.match(/\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/i)
    const code = match?.[1]
    return code && isPlausibleInstagramShortcode(code) ? code : null
  } catch {
    return null
  }
}

/**
 * Parse a collector DM for exactly one of memes / anime / sports.
 * Returns null when missing or when two different niches appear.
 */
export function parseCollectorNiche(text: string | null | undefined): NicheSlug | null {
  if (!text) return null
  const tokens = text.toLowerCase().match(/[a-z]+/g) ?? []
  const found = new Set<NicheSlug>()
  for (const token of tokens) {
    const slug = NICHE_ALIASES[token]
    if (slug) found.add(slug)
  }
  if (found.size !== 1) return null
  return [...found][0] ?? null
}

export function isNicheSlug(value: string): value is NicheSlug {
  return (NICHE_SLUGS as readonly string[]).includes(value)
}

/** Pull Instagram reel/post permalinks from HTML or plain text. */
export function extractInstagramReelUrls(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const add = (code: string | undefined) => {
    if (!code || !isPlausibleInstagramShortcode(code)) return
    const url = `https://www.instagram.com/reel/${code}/`
    if (seen.has(url)) return
    seen.add(url)
    out.push(url)
  }
  for (const match of raw.matchAll(REEL_HREF_RE)) add(match[1])
  for (const match of raw.matchAll(ESCAPED_REEL_RE)) add(match[1])
  for (const match of raw.matchAll(CLIP_CODE_RE)) add(match[1])
  return out
}

export type PreparedSourceIngest =
  | { ok: true; normalizedUrl: string; platform: Platform }
  | { ok: false; error: string }

export function prepareSourceIngest(sourceUrl: string): PreparedSourceIngest {
  const urlCheck = validateSourceUrl(sourceUrl)
  if (!urlCheck.valid) {
    return { ok: false, error: urlCheck.error }
  }
  const platform = detectPlatform(urlCheck.normalizedUrl)
  if (!platform) {
    return { ok: false, error: 'Only YouTube and Instagram links are supported.' }
  }
  return { ok: true, normalizedUrl: urlCheck.normalizedUrl, platform }
}

export function instagramEmbedUrl(normalizedUrl: string): string | null {
  try {
    const url = new URL(normalizedUrl)
    if (!url.hostname.includes('instagram.com')) return null
    const path = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`
    return `https://www.instagram.com${path}embed/`
  } catch {
    return null
  }
}

/** Pair reel permalinks with the niche bubble that follows each preview card. */
export function zipUrlsWithFollowingText(
  urls: string[],
  followingTexts: string[],
): { sourceUrl: string; nearbyText: string }[] {
  return urls.map((sourceUrl, i) => ({
    sourceUrl,
    nearbyText: (followingTexts[i] ?? '').trim(),
  }))
}
