import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ffmpegStatus = { active: 0, pending: 0 }
const uploadStatus = { active: 0, pending: 0 }
const jobsCount = vi.fn()

vi.mock('../src/jobs/ConcurrencyGuard', () => ({
  getFfmpegQueueStatus: () => ffmpegStatus,
  getUploadQueueStatus: () => uploadStatus,
}))

vi.mock('../src/db/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        in: () => ({
          gt: () => ({
            gte: () => jobsCount(),
          }),
        }),
      }),
    }),
  },
}))

vi.mock('../src/logging/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

describe('collectorHold', () => {
  afterEach(async () => {
    const { setCollectorHold, setCollectorUsingChrome } = await import(
      '../src/collector/collectorHold'
    )
    setCollectorHold(false)
    setCollectorUsingChrome(false)
  })

  beforeEach(async () => {
    ffmpegStatus.active = 0
    ffmpegStatus.pending = 0
    uploadStatus.active = 0
    uploadStatus.pending = 0
    jobsCount.mockResolvedValue({ count: 0, error: null })
    const { setCollectorHold, setCollectorUsingChrome } = await import(
      '../src/collector/collectorHold'
    )
    setCollectorHold(false)
    setCollectorUsingChrome(false)
  })

  it('blocks claims only while hold is on', async () => {
    const hold = await import('../src/collector/collectorHold')
    expect(hold.isCollectorHold()).toBe(false)
    hold.setCollectorHold(true)
    expect(hold.isCollectorHold()).toBe(true)
    hold.setCollectorHold(false)
    expect(hold.isCollectorHold()).toBe(false)
  })

  it('treats active ffmpeg as not idle', async () => {
    ffmpegStatus.active = 1
    const { isPipelineIdle } = await import('../src/collector/collectorHold')
    expect(await isPipelineIdle()).toBe(false)
  })

  it('is idle when queues and locked jobs are clear', async () => {
    const { isPipelineIdle } = await import('../src/collector/collectorHold')
    expect(await isPipelineIdle()).toBe(true)
  })
})
