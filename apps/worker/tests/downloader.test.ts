import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const runCommandMock = vi.fn()

vi.mock('../src/utils/runCommand', () => ({
  runCommand: (...args: unknown[]) => runCommandMock(...args),
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
    expect(result.description).toContain('Original mock caption')
  })
})

describe('YtDlpDownloader', () => {
  beforeEach(() => {
    runCommandMock.mockReset()
  })

  it('uses argument array with source URL as separate element', async () => {
    const sourceUrl = 'https://www.youtube.com/watch?v=abc123'
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ytdlp-test-'))
    const localPath = path.join(tempDir, 'source.mp4')
    await fs.copyFile(path.join(__dirname, 'fixtures/sample.mp4'), localPath)

    runCommandMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'yt-dlp') return { stdout: localPath, stderr: '', exitCode: 0 }
      if (cmd === 'ffprobe') return { stdout: '30.0\n', stderr: '', exitCode: 0 }
      return { stdout: '', stderr: '', exitCode: 0 }
    })

    const { YtDlpDownloader } = await import('../src/downloaders/YtDlpDownloader')
    const downloader = new YtDlpDownloader()

    const result = await downloader.download({
      sourceUrl,
      jobId: 'job-3',
      tempDir,
      sourcePlatform: 'youtube',
    })

    expect(runCommandMock).toHaveBeenCalled()
    const ytCall = runCommandMock.mock.calls.find((c) => c[0] === 'yt-dlp') as [
      string,
      string[],
      { timeout: number },
    ]
    expect(ytCall).toBeTruthy()
    const [, args, options] = ytCall

    expect(Array.isArray(args)).toBe(true)
    expect(args[args.length - 1]).toBe(sourceUrl)
    expect(args).toContain('--max-filesize')
    expect(args).toContain('--write-info-json')
    expect(options.timeout).toBe(180_000)
    expect(result.localPath).toBe(localPath)
    expect(result.fileSize).toBeGreaterThan(0)
  })

  it('returns title and description from yt-dlp info.json', async () => {
    const sourceUrl = 'https://www.instagram.com/reel/abc123/'
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ytdlp-info-'))
    const localPath = path.join(tempDir, 'source.mp4')
    await fs.copyFile(path.join(__dirname, 'fixtures/sample.mp4'), localPath)
    await fs.writeFile(
      path.join(tempDir, 'source.info.json'),
      JSON.stringify({
        title: 'IG short title',
        description: 'Original reel caption about the play of the day',
        uploader: 'sportsfan',
      }),
    )

    runCommandMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'yt-dlp') return { stdout: localPath, stderr: '', exitCode: 0 }
      if (cmd === 'ffprobe') return { stdout: '12.0\n', stderr: '', exitCode: 0 }
      return { stdout: '', stderr: '', exitCode: 0 }
    })

    const { YtDlpDownloader } = await import('../src/downloaders/YtDlpDownloader')
    const downloader = new YtDlpDownloader()

    const result = await downloader.download({
      sourceUrl,
      jobId: 'job-info',
      tempDir,
      sourcePlatform: 'instagram',
    })

    expect(result.title).toBe('IG short title')
    expect(result.description).toBe('Original reel caption about the play of the day')
    expect(result.uploader).toBe('sportsfan')
  })

  it('wraps yt-dlp failures in DOWNLOAD_FAILED', async () => {
    runCommandMock.mockRejectedValue(new Error('network error'))

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
    runCommandMock.mockRejectedValue(new Error('Command timed out after 120000ms: yt-dlp'))

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
    runCommandMock.mockReset()

    const { createDownloader } = await import('../src/downloaders/index')
    const downloader = createDownloader()

    expect(downloader.constructor.name).toBe('MockDownloader')
    expect(runCommandMock).not.toHaveBeenCalled()
  })
})
