import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/config', () => ({
  config: {
    TMP_DIR: '',
  },
}))

describe('TempFileManager', () => {
  let baseDir: string

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'temp-file-manager-'))
    vi.resetModules()
    vi.doMock('../src/config', () => ({
      config: { TMP_DIR: baseDir },
    }))
  })

  it('createJobDir creates directory at expected path', async () => {
    const { TempFileManager } = await import('../src/jobs/TempFileManager')
    const manager = new TempFileManager()

    const dir = await manager.createJobDir('job-abc')
    const expected = path.join(baseDir, 'job-abc')

    expect(dir).toBe(expected)
    await expect(fs.access(expected)).resolves.toBeUndefined()
  })

  it('cleanupJobDir removes the directory', async () => {
    const { TempFileManager } = await import('../src/jobs/TempFileManager')
    const manager = new TempFileManager()
    const dir = await manager.createJobDir('job-cleanup')

    await manager.cleanupJobDir('job-cleanup')

    await expect(fs.access(dir)).rejects.toThrow()
  })

  it('cleanupJobDir does not throw if directory does not exist', async () => {
    const { TempFileManager } = await import('../src/jobs/TempFileManager')
    const manager = new TempFileManager()

    await expect(manager.cleanupJobDir('nonexistent-job')).resolves.toBeUndefined()
  })

  it('getOutputPath returns correct file path without creating it', async () => {
    const { TempFileManager } = await import('../src/jobs/TempFileManager')
    const manager = new TempFileManager()

    const outputPath = manager.getOutputPath('job-out')
    const expected = path.join(baseDir, 'job-out', 'job_job-out_edited.mp4')

    expect(outputPath).toBe(expected)
    await expect(fs.access(expected)).rejects.toThrow()
  })
})
