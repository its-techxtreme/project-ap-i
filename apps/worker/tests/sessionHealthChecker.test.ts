import { beforeEach, describe, expect, it, vi } from 'vitest'

const launchPersistentContextMock = vi.fn()
const accessMock = vi.fn()

vi.mock('fs/promises', () => ({
  default: {
    access: (...args: unknown[]) => accessMock(...args),
  },
}))

vi.mock('playwright', () => ({
  chromium: {
    launchPersistentContext: (...args: unknown[]) => launchPersistentContextMock(...args),
  },
}))

vi.mock('../src/uploaders/playwrightContext', () => ({
  launchAuthenticatedContext: (...args: unknown[]) => launchPersistentContextMock(...args),
}))

describe('SessionHealthChecker', () => {
  beforeEach(() => {
    accessMock.mockReset()
    launchPersistentContextMock.mockReset()
  })

  it('returns loginRequired when no profilePath provided', async () => {
    const { SessionHealthChecker } = await import('../src/uploaders/SessionHealthChecker')
    const checker = new SessionHealthChecker()

    const result = await checker.checkSession('acct-1')

    expect(result.healthy).toBe(false)
    expect(result.loginRequired).toBe(true)
    expect(result.reason).toContain('No browser profile path')
    expect(launchPersistentContextMock).not.toHaveBeenCalled()
  })

  it('returns loginRequired when profilePath directory does not exist', async () => {
    accessMock.mockRejectedValue(new Error('ENOENT'))

    const { SessionHealthChecker } = await import('../src/uploaders/SessionHealthChecker')
    const checker = new SessionHealthChecker()

    const result = await checker.checkSession('acct-1', '/missing/profile')

    expect(result.healthy).toBe(false)
    expect(result.loginRequired).toBe(true)
    expect(result.reason).toContain('not found')
    expect(launchPersistentContextMock).not.toHaveBeenCalled()
  })

  it('does not crash when browser profile fails to load', async () => {
    accessMock.mockResolvedValue(undefined)
    launchPersistentContextMock.mockRejectedValue(new Error('Profile failed to launch'))

    const { SessionHealthChecker } = await import('../src/uploaders/SessionHealthChecker')
    const checker = new SessionHealthChecker()

    const result = await checker.checkSession('acct-1', '/tmp/profile')

    expect(result.healthy).toBe(false)
    expect(result.loginRequired).toBe(true)
    expect(result.reason).toContain('failed to load')
  })

  it('returns healthy when profile loads successfully', async () => {
    accessMock.mockResolvedValue(undefined)
    launchPersistentContextMock.mockResolvedValue({
      pages: () => [],
      close: vi.fn().mockResolvedValue(undefined),
    })

    const { SessionHealthChecker } = await import('../src/uploaders/SessionHealthChecker')
    const checker = new SessionHealthChecker()

    const result = await checker.checkSession('acct-1', '/tmp/profile')

    expect(result.healthy).toBe(true)
    expect(result.loginRequired).toBeUndefined()
  })
})
