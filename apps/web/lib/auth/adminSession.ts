/** Admin cookie. Web Crypto so Edge middleware can read it. */

export const ADMIN_SESSION_COOKIE = 'api_admin_session'
export const SESSION_TTL_SECONDS = 60 * 60 * 12 // 12 hours

export type DashboardRole = 'admin' | 'demo'

export interface AdminSessionPayload {
  username: string
  /** Missing on legacy tokens — treated as admin only if username matches ADMIN_USERNAME. */
  role?: DashboardRole
  iat: number
  exp: number
}

function getSessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET?.trim()
  if (!secret || secret.length < 32) {
    throw new Error(
      'ADMIN_SESSION_SECRET must be set to a random string of at least 32 characters.',
    )
  }
  return secret
}

function b64urlFromBytes(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]!)
  if (typeof btoa === 'function') {
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  }
  return Buffer.from(arr).toString('base64url')
}

function b64urlFromString(value: string): string {
  if (typeof btoa === 'function') {
    return btoa(unescape(encodeURIComponent(value)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')
  }
  return Buffer.from(value, 'utf8').toString('base64url')
}

function bytesFromB64url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  const b64 = padded + pad
  if (typeof atob === 'function') {
    const binary = atob(b64)
    const out = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
    return out
  }
  return new Uint8Array(Buffer.from(value, 'base64url'))
}

async function hmacSign(payloadB64: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(getSessionSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payloadB64))
  return b64urlFromBytes(sig)
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

export async function createAdminSessionToken(
  username: string,
  role: DashboardRole = 'admin',
  now = Date.now(),
): Promise<string> {
  const payload: AdminSessionPayload = {
    username,
    role,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS,
  }
  const payloadB64 = b64urlFromString(JSON.stringify(payload))
  const sig = await hmacSign(payloadB64)
  return `${payloadB64}.${sig}`
}

export async function verifyAdminSessionToken(
  token: string | undefined | null,
): Promise<AdminSessionPayload | null> {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null

  const [payloadB64, sig] = parts
  let expected: string
  try {
    expected = await hmacSign(payloadB64)
  } catch {
    return null
  }

  const sigBytes = bytesFromB64url(sig)
  const expectedBytes = bytesFromB64url(expected)
  if (!timingSafeEqualBytes(sigBytes, expectedBytes)) return null

  try {
    const jsonBytes = bytesFromB64url(payloadB64)
    const json = new TextDecoder().decode(jsonBytes)
    const payload = JSON.parse(json) as AdminSessionPayload
    if (
      typeof payload.username !== 'string' ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number'
    ) {
      return null
    }
    if (payload.exp * 1000 <= Date.now()) return null
    if (!payload.username.trim()) return null
    if (payload.role !== undefined && payload.role !== 'admin' && payload.role !== 'demo') {
      return null
    }
    return payload
  } catch {
    return null
  }
}

export function adminSessionCookieOptions(maxAge = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  }
}
