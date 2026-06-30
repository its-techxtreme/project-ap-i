import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const execaMock = vi.fn()

vi.mock('execa', () => ({
  execa: (...args: unknown[]) => execaMock(...args),
}))

describe('MockDownloader', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'downloader-test-'))
  })

  it('copies fixture to temp dir', async () => {
    const { MockDownloader } = await import('../src/downloaders/MockDownloader')
    const downloader = new MockDownloader()

    const result = await downloader.download({
      sourceUrl: 'https://www.youtube.com/watch?v=test',
      jobId: 'job-1',
      tempDir,
      sourcePlatform: 'youtube',
    })

    expect(result.localPath).toBe(path.join(tempDir, 'source.mp4'))
    await expect(fs.access(result.localPath)).resolves.toBeUndefined()
  })

  it('returns correct file size', async () => {
    const { MockDownloader } = await import('../src/downloaders/MockDownloader')
    const fixturePath = path.join(__dirname, 'fixtures/sample.mp4')
    const fixtureStat = await fs.stat(fixturePath)

    const downloader = new MockDownloader()
    const result = await downloader.download({
      sourceUrl: 'https://www.youtube.com/watch?v=test',
      jobId: 'job-2',
      tempDir,
      sourcePlatform: 'youtube',
    })

    expect(result.fileSize).toBe(fixtureStat.size)
    expect(result.duration).toBe(30)
    expect(result.title).toBe('Mock video')
  })
})

describe('YtDlpDownloader', () => {
  beforeEach(() => {
    execaMock.mockReset()
  })

  it('uses argument array with source URL as separate element', async () => {
    const sourceUrl = 'https://www.youtube.com/watch?v=abc123'
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ytdlp-test-'))
    const localPath = path.join(tempDir, 'source.mp4')
    await fs.copyFile(path.join(__dirname, 'fixtures/sample.mp4'), localPath)

    execaMock.mockResolvedValue({
      stdout: localPath,
    })

    const { YtDlpDownloader } = await import('../src/downloaders/YtDlpDownloader')
    const downloader = new YtDlpDownloader()

    const result = await downloader.download({
      sourceUrl,
      jobId: 'job-3',
      tempDir,
      sourcePlatform: 'youtube',
    })

    expect(execaMock).toHaveBeenCalledOnce()
    const [command, args, options] = execaMock.mock.calls[0] as [string, string[], { timeout: number }]

    expect(command).toBe('yt-dlp')
    expect(Array.isArray(args)).toBe(true)
    expect(args[args.length - 1]).toBe(sourceUrl)
    expect(args).toContain('--max-filesize')
    expect(args).toContain('--match-filter')
    expect(options.timeout).toBe(120_000)
    expect(options.shell).toBeUndefined()
    expect(result.localPath).toBe(localPath)
    expect(result.fileSize).toBeGreaterThan(0)
  })

  it('wraps yt-dlp failures in DOWNLOAD_FAILED', async () => {
    execaMock.mockRejectedValue(new Error('network error'))

    const { YtDlpDownloader } = await import('../src/downloaders/YtDlpDownloader')
    const downloader = new YtDlpDownloader()

    await expect(
      downloader.download({
        sourceUrl: 'https://www.youtube.com/watch?v=fail',
        jobId: 'job-fail',
        tempDir: await fs.mkdtemp(path.join(os.tmpdir(), 'ytdlp-fail-')),
        sourcePlatform: 'youtube',
      }),
    ).rejects.toMatchObject({ code: 'DOWNLOAD_FAILED' })
  })

  it('wraps yt-dlp timeouts in DOWNLOAD_TIMEOUT', async () => {
    execaMock.mockRejectedValue(new Error('Command timed out after 120000 milliseconds'))

    const { YtDlpDownloader } = await import('../src/downloaders/YtDlpDownloader')
    const downloader = new YtDlpDownloader()

    await expect(
      downloader.download({
        sourceUrl: 'https://www.youtube.com/watch?v=timeout',
        jobId: 'job-timeout',
        tempDir: await fs.mkdtemp(path.join(os.tmpdir(), 'ytdlp-timeout-')),
        sourcePlatform: 'youtube',
      }),
    ).rejects.toMatchObject({ code: 'DOWNLOAD_TIMEOUT' })
  })

  it('does not invoke yt-dlp when INTEGRATION_TESTS_ENABLED is false', async () => {
    vi.resetModules()
    execaMock.mockReset()

    const { createDownloader } = await import('../src/downloaders/index')
    const downloader = createDownloader()

    expect(downloader.constructor.name).toBe('MockDownloader')
    expect(execaMock).not.toHaveBeenCalled()
  })
})
