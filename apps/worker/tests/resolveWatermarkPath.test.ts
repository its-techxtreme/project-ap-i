import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('resolveWatermarkPath', () => {
  const tempDirs: string[] = []

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns niche-specific watermark when file exists', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wm-'))
    tempDirs.push(dir)
    const anime = path.join(dir, 'anime.png')
    fs.writeFileSync(anime, 'fake')

    vi.doMock('../src/config', () => ({
      config: {
        WATERMARK_PATH: path.join(dir, 'fallback.png'),
        WATERMARKS_DIR: dir,
      },
    }))
    vi.doMock('../src/logging/logger', () => ({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }))

    const { resolveWatermarkPath } = await import('../src/processors/resolveWatermarkPath')
    expect(resolveWatermarkPath('anime')).toBe(anime)
  })

  it('falls back to WATERMARK_PATH when niche file is missing', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wm-'))
    tempDirs.push(dir)
    const fallback = path.join(dir, 'fallback.png')
    fs.writeFileSync(fallback, 'fake')

    vi.doMock('../src/config', () => ({
      config: {
        WATERMARK_PATH: fallback,
        WATERMARKS_DIR: dir,
      },
    }))
    vi.doMock('../src/logging/logger', () => ({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }))

    const { resolveWatermarkPath } = await import('../src/processors/resolveWatermarkPath')
    expect(resolveWatermarkPath('memes')).toBe(fallback)
  })
})
