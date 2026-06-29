/**
 * Canonical niche definitions for Project AP-I.
 * These are the ONLY valid niches. Do not hardcode elsewhere.
 */
export const NICHES = [
  { slug: 'memes', label: 'Memes' },
  { slug: 'anime', label: 'Anime' },
  { slug: 'sports', label: 'Sports' },
] as const

export type NicheSlug = (typeof NICHES)[number]['slug']
export type NicheLabel = (typeof NICHES)[number]['label']

export const NICHE_SLUGS = NICHES.map((n) => n.slug) as [NicheSlug, ...NicheSlug[]]

/**
 * Canonical platform definitions.
 */
export const PLATFORMS = ['youtube', 'instagram'] as const
export type Platform = (typeof PLATFORMS)[number]

/**
 * Allowed source URL hostnames. Used by both frontend and worker validation.
 */
export const ALLOWED_HOSTNAMES = [
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'instagram.com',
  'www.instagram.com',
] as const

export type AllowedHostname = (typeof ALLOWED_HOSTNAMES)[number]

/**
 * Concurrency and timing defaults (can be overridden by env/settings).
 */
export const DEFAULTS = {
  MAX_FFMPEG_CONCURRENCY: 1,
  MAX_DOWNLOAD_CONCURRENCY: 2,
  MAX_UPLOAD_CONCURRENCY_PER_PLATFORM: 1,
  JOB_LOCK_MINUTES: 45,
  VERIFY_DELAY_MINUTES: 30,
  MAX_SOURCE_DURATION_SECONDS: 180,
  MAX_SOURCE_FILE_SIZE_MB: 500,
} as const
