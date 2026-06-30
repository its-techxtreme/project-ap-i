import { describe, expect, it, vi } from 'vitest'

describe('ConcurrencyGuard', () => {
  it('only runs 1 FFmpeg job at a time when limit is 1', async () => {
    vi.resetModules()
    vi.doMock('../src/config', () => ({
      config: { MAX_FFMPEG_CONCURRENCY: 1 },
    }))

    const { withFfmpegConcurrency, getFfmpegQueueStatus } = await import('../src/jobs/ConcurrencyGuard')

    let activeDuringFirst = 0
    let activeDuringSecond = 0
    let firstStarted = false
    let firstResolve!: () => void

    const firstPromise = withFfmpegConcurrency(async () => {
      activeDuringFirst = getFfmpegQueueStatus().active
      firstStarted = true
      await new Promise<void>((resolve) => {
        firstResolve = resolve
      })
    })

    await vi.waitFor(() => expect(firstStarted).toBe(true))

    const secondPromise = withFfmpegConcurrency(async () => {
      activeDuringSecond = getFfmpegQueueStatus().active
    })

    expect(getFfmpegQueueStatus().pending).toBe(1)
    expect(activeDuringFirst).toBe(1)

    firstResolve()
    await firstPromise
    await secondPromise

    expect(activeDuringSecond).toBe(1)
    expect(getFfmpegQueueStatus().active).toBe(0)
    expect(getFfmpegQueueStatus().pending).toBe(0)
  })

  it('queue status shows correct active and pending counts', async () => {
    vi.resetModules()
    vi.doMock('../src/config', () => ({
      config: { MAX_FFMPEG_CONCURRENCY: 1 },
    }))

    const { withFfmpegConcurrency, getFfmpegQueueStatus } = await import('../src/jobs/ConcurrencyGuard')

    let releaseFirst!: () => void
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    const first = withFfmpegConcurrency(async () => {
      await gate
    })
    const second = withFfmpegConcurrency(async () => undefined)

    await vi.waitFor(() => expect(getFfmpegQueueStatus().active).toBe(1))
    expect(getFfmpegQueueStatus().pending).toBe(1)
    expect(getFfmpegQueueStatus().concurrencyLimit).toBe(1)

    releaseFirst()
    await first
    await second

    expect(getFfmpegQueueStatus().active).toBe(0)
    expect(getFfmpegQueueStatus().pending).toBe(0)
  })

  it('second job waits for first to complete before starting', async () => {
    vi.resetModules()
    vi.doMock('../src/config', () => ({
      config: { MAX_FFMPEG_CONCURRENCY: 1 },
    }))

    const { withFfmpegConcurrency } = await import('../src/jobs/ConcurrencyGuard')

    const order: string[] = []
    let releaseFirst!: () => void

    const first = withFfmpegConcurrency(async () => {
      order.push('first-start')
      await new Promise<void>((resolve) => {
        releaseFirst = resolve
      })
      order.push('first-end')
    })

    await vi.waitFor(() => expect(order).toContain('first-start'))

    const second = withFfmpegConcurrency(async () => {
      order.push('second-start')
    })

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(order).toEqual(['first-start'])

    releaseFirst()
    await first
    await second

    expect(order).toEqual(['first-start', 'first-end', 'second-start'])
  })
})
