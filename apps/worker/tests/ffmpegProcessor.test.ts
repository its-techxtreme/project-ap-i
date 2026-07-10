import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { ERROR_CODES, ProjectApiError } from '@project-api/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildFfmpegArgs } from '../src/processors/WatermarkPreset'

const runCommandMock = vi.fn()

vi.mock('../src/utils/runCommand', () => ({
  runCommand: (...args: unknown[]) => runCommandMock(...args),
}))

vi.mock('../src/processors/probeMedia', () => ({
  sourceHasAudio: vi.fn().mockResolvedValue(true),
}))

describe('buildFfmpegArgs', () => {
  const inputPath = '/tmp/jobs/job-1/source.mp4'
  const outputPath = '/tmp/jobs/job-1/job_job-1_edited.mp4'
  const watermarkPath = '/app/assets/watermark.png'

  it('includes input and watermark paths as separate -i args', () => {
    const args = buildFfmpegArgs({ inputPath, outputPath, watermarkPath })

    expect(args).toContain('-i')
    const inputIndex = args.indexOf('-i')
    expect(args[inputIndex + 1]).toBe(inputPath)

    const secondInputIndex = args.indexOf('-i', inputIndex + 1)
    expect(args[secondInputIndex + 1]).toBe(watermarkPath)
  })

  it('includes setpts=PTS/1.1 for video speed', () => {
    const args = buildFfmpegArgs({ inputPath, outputPath, watermarkPath })
    const filterIndex = args.indexOf('-filter_complex')

    expect(args[filterIndex + 1]).toContain('setpts=PTS/1.1')
  })

  it('includes atempo=1.1 and optional audio map when source has audio', () => {
    const args = buildFfmpegArgs({ inputPath, outputPath, watermarkPath, hasAudio: true })
    const audioFilterIndex = args.indexOf('-af')

    expect(args[audioFilterIndex + 1]).toBe('atempo=1.1')
    expect(args).toContain('0:a?')
  })

  it('omits audio filters when source has no audio', () => {
    const args = buildFfmpegArgs({ inputPath, outputPath, watermarkPath, hasAudio: false })

    expect(args).not.toContain('-af')
    expect(args).not.toContain('0:a?')
    expect(args).not.toContain('-c:a')
  })

  it('includes bottom-right overlay position', () => {
    const args = buildFfmpegArgs({ inputPath, outputPath, watermarkPath })
    const filterIndex = args.indexOf('-filter_complex')

    expect(args[filterIndex + 1]).toContain('overlay=W-w-10:H-h-10')
  })

  it('includes 70% opacity via colorchannelmixer', () => {
    const args = buildFfmpegArgs({ inputPath, outputPath, watermarkPath })
    const filterIndex = args.indexOf('-filter_complex')

    expect(args[filterIndex + 1]).toContain('colorchannelmixer=aa=0.7')
    expect(args[filterIndex + 1]).toContain('scale=56:-1')
  })
})

describe('FfmpegProcessor', () => {
  let tempDir: string
  let sourcePath: string
  let watermarkPath: string

  beforeEach(async () => {
    runCommandMock.mockReset()
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ffmpeg-test-'))
    sourcePath = path.join(tempDir, 'source.mp4')
    watermarkPath = path.join(tempDir, 'watermark.png')

    await fs.copyFile(path.join(__dirname, 'fixtures/sample.mp4'), sourcePath)
    await fs.writeFile(watermarkPath, Buffer.from('fake-png'))
  })

  it('throws FFMPEG_FAILED when source file does not exist', async () => {
    const { FfmpegProcessor } = await import('../src/processors/FfmpegProcessor')
    const processor = new FfmpegProcessor()

    await expect(
      processor.process({
        jobId: 'job-no-source',
        sourcePath: path.join(tempDir, 'missing-source.mp4'),
        tempDir,
        watermarkPath,
      }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.FFMPEG_FAILED,
    } satisfies Partial<ProjectApiError>)
  })

  it('throws WATERMARK_MISSING when watermark file does not exist', async () => {
    const { FfmpegProcessor } = await import('../src/processors/FfmpegProcessor')
    const processor = new FfmpegProcessor()

    await expect(
      processor.process({
        jobId: 'job-missing-wm',
        sourcePath,
        tempDir,
        watermarkPath: path.join(tempDir, 'missing.png'),
      }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.WATERMARK_MISSING,
    } satisfies Partial<ProjectApiError>)
  })

  it('throws FFMPEG_FAILED when ffmpeg exits with non-zero code', async () => {
    runCommandMock.mockRejectedValue(new Error('ffmpeg exited with code 1'))

    const { FfmpegProcessor } = await import('../src/processors/FfmpegProcessor')
    const processor = new FfmpegProcessor()

    await expect(
      processor.process({
        jobId: 'job-ffmpeg-fail',
        sourcePath,
        tempDir,
        watermarkPath,
      }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.FFMPEG_FAILED,
    } satisfies Partial<ProjectApiError>)
  })

  it('names output file job_<jobId>_edited.mp4', async () => {
    const outputPath = path.join(tempDir, 'job_job-42_edited.mp4')
    runCommandMock.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 })
    vi.spyOn(fs, 'stat').mockResolvedValue({ size: 2048 } as Awaited<ReturnType<typeof fs.stat>>)

    const { FfmpegProcessor } = await import('../src/processors/FfmpegProcessor')
    const processor = new FfmpegProcessor()

    const result = await processor.process({
      jobId: 'job-42',
      sourcePath,
      tempDir,
      watermarkPath,
    })

    expect(result.outputPath).toBe(outputPath)
    expect(runCommandMock.mock.calls[0]?.[1]).toContain(outputPath)
  })
})
