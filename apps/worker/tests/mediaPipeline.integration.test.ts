import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { runCommand } from '../src/utils/runCommand'

const FIXTURE_DIR = path.join(__dirname, 'fixtures')
const SAMPLE_MP4 = path.join(FIXTURE_DIR, 'sample.mp4')
const BACKGROUND_MUSIC = path.join(
  __dirname,
  '../assets/bgm/absolutesound-background-guitar-no-copyright-561871.mp3',
)

async function ffmpegAvailable(): Promise<boolean> {
  try {
    await runCommand('ffmpeg', ['-version'], { timeout: 10_000 })
    return true
  } catch {
    return false
  }
}

const runIntegration = process.env.RUN_FFMPEG_INTEGRATION_TESTS === 'true'

describe.skipIf(!runIntegration)('media pipeline integration (real ffmpeg)', () => {
  let baseDir: string
  let originalTmpDir: string | undefined

  beforeAll(async () => {
    if (!(await ffmpegAvailable())) {
      throw new Error('ffmpeg not available — install ffmpeg before enabling integration tests')
    }

    await fs.access(BACKGROUND_MUSIC)

    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'media-pipeline-int-'))
    originalTmpDir = process.env.TMP_DIR
    process.env.TMP_DIR = baseDir
  })

  afterAll(async () => {
    if (originalTmpDir === undefined) {
      delete process.env.TMP_DIR
    } else {
      process.env.TMP_DIR = originalTmpDir
    }
    if (baseDir) {
      await fs.rm(baseDir, { recursive: true, force: true })
    }
  })

  it('MockDownloader → FfmpegProcessor produces valid edited mp4', async () => {
    vi.resetModules()
    const { TempFileManager } = await import('../src/jobs/TempFileManager')
    const { withFfmpegConcurrency } = await import('../src/jobs/ConcurrencyGuard')
    const { MockDownloader } = await import('../src/downloaders/MockDownloader')
    const { FfmpegProcessor } = await import('../src/processors/FfmpegProcessor')

    const jobId = 'integration-job-1'
    const tempManager = new TempFileManager()
    const tempDir = await tempManager.createJobDir(jobId)

    const downloader = new MockDownloader()
    const download = await downloader.download({
      sourceUrl: 'https://www.youtube.com/watch?v=integration',
      jobId,
      tempDir,
      sourcePlatform: 'youtube',
    })

    expect(download.fileSize).toBeGreaterThan(0)
    await expect(fs.access(SAMPLE_MP4)).resolves.toBeUndefined()

    const processor = new FfmpegProcessor()
    const processed = await withFfmpegConcurrency(() =>
      processor.process({
        jobId,
        sourcePath: download.localPath,
        tempDir,
        backgroundMusicPath: BACKGROUND_MUSIC,
      }),
    )

    expect(processed.outputPath).toBe(tempManager.getOutputPath(jobId))
    expect(processed.fileSize).toBeGreaterThan(1000)

    const probe = await runCommand('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'stream=codec_type',
      '-of',
      'json',
      processed.outputPath,
    ])
    const info = JSON.parse(probe.stdout) as { streams: { codec_type: string }[] }
    expect(info.streams.some((s) => s.codec_type === 'video')).toBe(true)

    await tempManager.cleanupJobDir(jobId)
    await expect(fs.access(tempDir)).rejects.toThrow()
  })

  it('processes source with audio when present', async () => {
    const { FfmpegProcessor } = await import('../src/processors/FfmpegProcessor')

    const audioSource = path.join(baseDir, 'source-with-audio.mp4')
    await runCommand('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=blue:s=320x568:d=2',
      '-f',
      'lavfi',
      '-i',
      'sine=f=440:d=2',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      audioSource,
    ])

    const jobId = 'integration-job-audio'
    const tempDir = path.join(baseDir, jobId)
    await fs.mkdir(tempDir, { recursive: true })

    const processor = new FfmpegProcessor()
    const processed = await processor.process({
      jobId,
      sourcePath: audioSource,
      tempDir,
      backgroundMusicPath: BACKGROUND_MUSIC,
    })

    const probe = await runCommand('ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'a',
      '-show_entries',
      'stream=codec_type',
      '-of',
      'csv=p=0',
      processed.outputPath,
    ])
    expect(probe.stdout.trim()).toBe('audio')
  })
})

describe('media pipeline integration gate', () => {
  it('skips real ffmpeg tests unless RUN_FFMPEG_INTEGRATION_TESTS=true', () => {
    if (runIntegration) {
      expect(process.env.RUN_FFMPEG_INTEGRATION_TESTS).toBe('true')
    } else {
      expect(process.env.RUN_FFMPEG_INTEGRATION_TESTS).not.toBe('true')
    }
  })
})
