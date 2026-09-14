import { ALLOWED_HOSTNAMES, type Platform } from './constants'

export type UrlValidationResult =
  | { valid: true; normalizedUrl: string; hostname: string }
  | { valid: false; error: string; code: UrlErrorCode }

export type UrlErrorCode =
  | 'EMPTY_URL'
  | 'MALFORMED_URL'
  | 'UNSUPPORTED_PROTOCOL'
  | 'UNSUPPORTED_DOMAIN'
  | 'PRIVATE_IP'
  | 'LOCALHOST'

// loopback / rfc1918 / link-local — do not fetch these
const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^fc[0-9a-f]{2}:/i,
  /^fe[89ab][0-9a-f]:/i,
]

function isPrivateOrLocalhost(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  if (lower === 'localhost') return true
  if (PRIVATE_IP_PATTERNS.some((p) => p.test(lower))) return true
  return false
}

export function validateSourceUrl(raw: string): UrlValidationResult {
  if (!raw || raw.trim() === '') {
    return { valid: false, error: 'URL is required.', code: 'EMPTY_URL' }
  }

  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return { valid: false, error: 'URL is malformed.', code: 'MALFORMED_URL' }
  }

  if (url.protocol !== 'https:') {
    return {
      valid: false,
      error: 'Only HTTPS URLs are supported.',
      code: 'UNSUPPORTED_PROTOCOL',
    }
  }

  const hostname = url.hostname.toLowerCase()

  if (isPrivateOrLocalhost(hostname)) {
    return {
      valid: false,
      error: 'Private or local URLs are not allowed.',
      code: 'PRIVATE_IP',
    }
  }

  const allowed = ALLOWED_HOSTNAMES as readonly string[]
  if (!allowed.includes(hostname)) {
    return {
      valid: false,
      error: 'Only YouTube and Instagram links are supported.',
      code: 'UNSUPPORTED_DOMAIN',
    }
  }

  return {
    valid: true,
    normalizedUrl: url.toString(),
    hostname,
  }
}

export function detectPlatform(rawUrl: string): Platform | null {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, '')

  if (hostname === 'instagram.com') return 'instagram'
  if (hostname === 'youtube.com' || hostname === 'm.youtube.com' || hostname === 'youtu.be') {
    return 'youtube'
  }

  return null
}
