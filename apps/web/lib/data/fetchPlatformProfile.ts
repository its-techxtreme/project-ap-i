import { unstable_cache } from 'next/cache'

export type PlatformKind = 'youtube' | 'instagram'

export type LivePlatformProfile = {
  handle: string
  profileUrl: string
  displayName: string | null
  description: string | null
  avatarUrl: string | null
  fetched: boolean
}

/** Niche brand handles used when username_hint is empty (matches YT c-text brands). */
export const DEFAULT_NICHE_HANDLES: Record<string, string> = {
  anime: 'ShonenSnaps',
  memes: 'CrackleCrumb',
  sports: 'ScoreMorsel',
}

/** Instagram-only overrides when the public @handle differs from the brand label. */
export const DEFAULT_INSTAGRAM_HANDLES: Record<string, string> = {
  memes: 'thecracklecrumb',
}

export function resolveProfileHandle(
  platform: PlatformKind,
  usernameHint: string | null | undefined,
  nicheSlug: string,
): string | null {
  const hint = usernameHint?.trim().replace(/^@/, '')
  if (hint) return hint
  if (platform === 'instagram' && DEFAULT_INSTAGRAM_HANDLES[nicheSlug]) {
    return DEFAULT_INSTAGRAM_HANDLES[nicheSlug]
  }
  const fallback = DEFAULT_NICHE_HANDLES[nicheSlug]
  return fallback ?? null
}

export function profileUrlFor(platform: PlatformKind, handle: string): string {
  const clean = handle.trim().replace(/^@/, '')
  if (platform === 'youtube') return `https://www.youtube.com/@${clean}`
  return `https://www.instagram.com/${clean}/`
}

function decodeEntities(raw: string): string {
  return raw
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num: string) => String.fromCodePoint(Number(num)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function pickMeta(html: string, property: string): string | null {
  const patterns = [
    new RegExp(`property=["']${property}["']\\s+content=["']([^"']+)["']`, 'i'),
    new RegExp(`content=["']([^"']+)["']\\s+property=["']${property}["']`, 'i'),
    new RegExp(`name=["']${property}["']\\s+content=["']([^"']+)["']`, 'i'),
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m?.[1]) return decodeEntities(m[1])
  }
  return null
}

function cleanDescription(platform: PlatformKind, desc: string | null, handle: string): string | null {
  if (!desc) return null
  let text = decodeEntities(desc)
  if (platform === 'instagram') {
    // "N Followers, N Following, N Posts - See Instagram photos and videos from Name (@handle)"
    const dash = text.indexOf(' - See Instagram')
    if (dash > 0) text = text.slice(0, dash).trim()
    text = text.replace(new RegExp(`\\(@?${handle}\\)`, 'i'), '').trim()
  }
  if (platform === 'youtube') {
    text = text.replace(/\n+/g, ' · ')
  }
  return text.slice(0, 280) || null
}

function cleanDisplayName(platform: PlatformKind, title: string | null, handle: string): string | null {
  if (!title) return null
  let name = decodeEntities(title)
  if (platform === 'instagram') {
    name = name.replace(/\s*[•·].*$/, '').trim()
    name = name.replace(new RegExp(`\\(@?${handle}\\)`, 'i'), '').trim()
  }
  return name || handle
}

async function fetchOpenGraphProfile(
  platform: PlatformKind,
  handle: string,
): Promise<LivePlatformProfile> {
  const profileUrl = profileUrlFor(platform, handle)
  const empty: LivePlatformProfile = {
    handle,
    profileUrl,
    displayName: null,
    description: null,
    avatarUrl: null,
    fetched: false,
  }

  try {
    const res = await fetch(profileUrl, {
      redirect: 'follow',
      headers: {
        'user-agent':
          'Mozilla/5.0 (compatible; ProjectAPI-SeaLanes/1.0; +https://ap-i.techxtreme.me)',
        accept: 'text/html,application/xhtml+xml',
      },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return empty
    const html = await res.text()
    const title = pickMeta(html, 'og:title')
    const image = pickMeta(html, 'og:image')
    const desc = pickMeta(html, 'og:description')
    return {
      handle,
      profileUrl,
      displayName: cleanDisplayName(platform, title, handle),
      description: cleanDescription(platform, desc, handle),
      avatarUrl: image,
      fetched: Boolean(title || image || desc),
    }
  } catch {
    return empty
  }
}

/** Cached live profile lookup (1h). Safe for server components. */
export async function getLivePlatformProfile(
  platform: PlatformKind,
  handle: string,
): Promise<LivePlatformProfile> {
  const clean = handle.trim().replace(/^@/, '')
  const cached = unstable_cache(
    () => fetchOpenGraphProfile(platform, clean),
    ['sea-lanes-profile', platform, clean.toLowerCase()],
    { revalidate: 3600 },
  )
  return cached()
}
