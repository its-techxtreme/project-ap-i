import { describe, expect, it } from 'vitest'
import { detectPlatform, validateSourceUrl } from '../src/urls'

describe('validateSourceUrl — valid cases', () => {
  it('accepts https://www.youtube.com/shorts/abc123', () => {
    const result = validateSourceUrl('https://www.youtube.com/shorts/abc123')
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(detectPlatform(result.normalizedUrl)).toBe('youtube')
    }
  })

  it('accepts https://youtube.com/shorts/abc123', () => {
    const result = validateSourceUrl('https://youtube.com/shorts/abc123')
    expect(result.valid).toBe(true)
  })

  it('accepts https://youtu.be/abc123', () => {
    const result = validateSourceUrl('https://youtu.be/abc123')
    expect(result.valid).toBe(true)
  })

  it('accepts https://m.youtube.com/shorts/abc123', () => {
    const result = validateSourceUrl('https://m.youtube.com/shorts/abc123')
    expect(result.valid).toBe(true)
  })

  it('accepts https://www.instagram.com/reel/abc123/', () => {
    const result = validateSourceUrl('https://www.instagram.com/reel/abc123/')
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(detectPlatform(result.normalizedUrl)).toBe('instagram')
    }
  })

  it('accepts https://instagram.com/reel/abc123/', () => {
    const result = validateSourceUrl('https://instagram.com/reel/abc123/')
    expect(result.valid).toBe(true)
  })
})

describe('validateSourceUrl — invalid cases', () => {
  it('rejects empty string with EMPTY_URL', () => {
    const result = validateSourceUrl('')
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.code).toBe('EMPTY_URL')
  })

  it('rejects whitespace with EMPTY_URL', () => {
    const result = validateSourceUrl('   ')
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.code).toBe('EMPTY_URL')
  })

  it('rejects not-a-url with MALFORMED_URL', () => {
    const result = validateSourceUrl('not-a-url')
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.code).toBe('MALFORMED_URL')
  })

  it('rejects http://youtube.com/shorts/abc with UNSUPPORTED_PROTOCOL', () => {
    const result = validateSourceUrl('http://youtube.com/shorts/abc')
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.code).toBe('UNSUPPORTED_PROTOCOL')
  })

  it('rejects ftp://youtube.com/shorts/abc with UNSUPPORTED_PROTOCOL', () => {
    const result = validateSourceUrl('ftp://youtube.com/shorts/abc')
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.code).toBe('UNSUPPORTED_PROTOCOL')
  })

  it('rejects file:///etc/passwd with UNSUPPORTED_PROTOCOL', () => {
    const result = validateSourceUrl('file:///etc/passwd')
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.code).toBe('UNSUPPORTED_PROTOCOL')
  })

  it('rejects https://localhost/shorts/abc with PRIVATE_IP or UNSUPPORTED_DOMAIN', () => {
    const result = validateSourceUrl('https://localhost/shorts/abc')
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(['PRIVATE_IP', 'UNSUPPORTED_DOMAIN']).toContain(result.code)
    }
  })

  it('rejects https://127.0.0.1/shorts/abc with PRIVATE_IP', () => {
    const result = validateSourceUrl('https://127.0.0.1/shorts/abc')
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.code).toBe('PRIVATE_IP')
  })

  it('rejects https://192.168.1.1/shorts/abc with PRIVATE_IP', () => {
    const result = validateSourceUrl('https://192.168.1.1/shorts/abc')
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.code).toBe('PRIVATE_IP')
  })

  it('rejects https://10.0.0.1/shorts/abc with PRIVATE_IP', () => {
    const result = validateSourceUrl('https://10.0.0.1/shorts/abc')
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.code).toBe('PRIVATE_IP')
  })

  it('rejects https://169.254.1.1/path with PRIVATE_IP', () => {
    const result = validateSourceUrl('https://169.254.1.1/path')
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.code).toBe('PRIVATE_IP')
  })

  it('rejects https://tiktok.com/video/abc with UNSUPPORTED_DOMAIN', () => {
    const result = validateSourceUrl('https://tiktok.com/video/abc')
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.code).toBe('UNSUPPORTED_DOMAIN')
  })

  it('rejects https://twitter.com/video/abc with UNSUPPORTED_DOMAIN', () => {
    const result = validateSourceUrl('https://twitter.com/video/abc')
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.code).toBe('UNSUPPORTED_DOMAIN')
  })

  it('rejects https://evil.com/youtube.com/fake with UNSUPPORTED_DOMAIN', () => {
    const result = validateSourceUrl('https://evil.com/youtube.com/fake')
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.code).toBe('UNSUPPORTED_DOMAIN')
  })
})

describe('detectPlatform', () => {
  it('detects youtube from www.youtube.com', () => {
    expect(detectPlatform('https://www.youtube.com/shorts/abc')).toBe('youtube')
  })

  it('detects youtube from youtu.be', () => {
    expect(detectPlatform('https://youtu.be/abc')).toBe('youtube')
  })

  it('detects youtube from m.youtube.com', () => {
    expect(detectPlatform('https://m.youtube.com/shorts/abc123')).toBe('youtube')
  })

  it('detects instagram from instagram.com', () => {
    expect(detectPlatform('https://instagram.com/reel/abc/')).toBe('instagram')
  })

  it('returns null for tiktok.com', () => {
    expect(detectPlatform('https://tiktok.com/video/abc')).toBeNull()
  })

  it('returns null for not-a-url', () => {
    expect(detectPlatform('not-a-url')).toBeNull()
  })
})
