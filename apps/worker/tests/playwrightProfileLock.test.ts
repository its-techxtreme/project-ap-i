import { describe, expect, it, beforeEach } from 'vitest'

import {
  resetPlaywrightProfileLocksForTests,
  withPlaywrightProfileLock,
} from '../src/uploaders/playwrightProfileLock'
import { isTransientUploadFailure } from '../src/uploaders/transientUploadErrors'

describe('withPlaywrightProfileLock', () => {
  beforeEach(() => {
    resetPlaywrightProfileLocksForTests()
  })

  it('serializes concurrent work on the same profile path', async () => {
    const order: string[] = []

    const a = withPlaywrightProfileLock('C:/profiles/anime-ig', async () => {
      order.push('a-start')
      await new Promise((r) => setTimeout(r, 40))
      order.push('a-end')
      return 'a'
    })

    const b = withPlaywrightProfileLock('C:/profiles/anime-ig', async () => {
      order.push('b-start')
      order.push('b-end')
      return 'b'
    })

    const [ra, rb] = await Promise.all([a, b])
    expect(ra).toBe('a')
    expect(rb).toBe('b')
    expect(order).toEqual(['a-start', 'a-end', 'b-start', 'b-end'])
  })

  it('allows different profiles to run concurrently', async () => {
    let overlap = false
    let aInside = false

    const a = withPlaywrightProfileLock('C:/profiles/anime-ig', async () => {
      aInside = true
      await new Promise((r) => setTimeout(r, 40))
      aInside = false
    })

    const b = withPlaywrightProfileLock('C:/profiles/memes-ig', async () => {
      if (aInside) overlap = true
      await new Promise((r) => setTimeout(r, 10))
    })

    await Promise.all([a, b])
    expect(overlap).toBe(true)
  })
})

describe('isTransientUploadFailure', () => {
  it('treats profile busy and create-dialog failures as transient', () => {
    expect(
      isTransientUploadFailure({
        success: false,
        errorCode: 'PROFILE_BUSY',
        errorMessage: 'busy',
      }),
    ).toBe(true)
    expect(
      isTransientUploadFailure({
        success: false,
        errorMessage: 'Instagram create dialog did not expose a file input',
      }),
    ).toBe(true)
    expect(
      isTransientUploadFailure({
        success: false,
        errorMessage: 'Opening in existing browser session',
      }),
    ).toBe(true)
  })

  it('does not retry success or login_required', () => {
    expect(isTransientUploadFailure({ success: true })).toBe(false)
    expect(
      isTransientUploadFailure({
        success: false,
        loginRequired: true,
        errorMessage: 'login',
      }),
    ).toBe(false)
  })
})
