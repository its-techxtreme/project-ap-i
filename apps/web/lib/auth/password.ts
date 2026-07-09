import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

/** scrypt$N$r$p$saltB64$hashB64 */
const HASH_PREFIX = 'scrypt'
const DEFAULT_N = 16384
const DEFAULT_R = 8
const DEFAULT_P = 1
const KEY_LEN = 64

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const derived = scryptSync(password, salt, KEY_LEN, {
    N: DEFAULT_N,
    r: DEFAULT_R,
    p: DEFAULT_P,
  })
  return [
    HASH_PREFIX,
    String(DEFAULT_N),
    String(DEFAULT_R),
    String(DEFAULT_P),
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$')
}

export function verifyPassword(password: string, encodedHash: string): boolean {
  const parts = encodedHash.split('$')
  if (parts.length !== 6 || parts[0] !== HASH_PREFIX) return false

  const N = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false

  let salt: Buffer
  let expected: Buffer
  try {
    salt = Buffer.from(parts[4], 'base64url')
    expected = Buffer.from(parts[5], 'base64url')
  } catch {
    return false
  }

  if (salt.length === 0 || expected.length === 0) return false
  // Reject obviously invalid cost params before calling scrypt.
  if (N < 2 || (N & (N - 1)) !== 0 || r < 1 || p < 1) return false

  try {
    const actual = scryptSync(password, salt, expected.length, { N, r, p })
    if (actual.length !== expected.length) return false
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

/** Constant-time string compare for usernames / tokens. */
export function safeEqualString(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) {
    // Still compare equal-length buffers to reduce timing signal on length alone.
    const dummy = Buffer.alloc(aBuf.length)
    timingSafeEqual(aBuf, dummy)
    return false
  }
  return timingSafeEqual(aBuf, bBuf)
}
