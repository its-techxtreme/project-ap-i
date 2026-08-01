import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { ERROR_CODES, ProjectApiError } from '@project-api/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  BACKGROUND_MUSIC_VOLUME,
  EDIT_SPEED,
  EDIT_VERTICAL_GEOMETRY,
  EDIT_VISUAL_FILTER,
  OUTPUT_HEIGHT,
  OUTPUT_WIDTH,
  buildFfmpegArgs,
} from '../src/processors/EditPreset'

const runCommandMock = vi.fn()
const probeVideoDimensionsMock = vi.fn()

vi.mock('../src/utils/runCommand', () => ({
  runCommand: (...args: unknown[]) => runCommandMock(...args),
}))

vi.mock('../src/processors/probeMedia', () => ({
  sourceHasAudio: vi.fn().mockResolvedValue(true),
  probeVideoDimensions: (...args: unknown[]) => probeVideoDimensionsMock(...args),
}))

describe('buildFfmpegArgs', () => {
  const inputPath = '/tmp/jobs/job-1/source.mp4'
  const outputPath = '/tmp/jobs/job-1/job_job-1_edited.mp4'
  const backgroundMusicPath = '/app/assets/bgm/absolutesound-background-guitar-no-copyright-561871.mp3'

  it('includes source and background music as separate -i args', () => {
    const args = buildFfmpegArgs({ inputPath, outputPath, backgroundMusicPath })

    expect(args).toContain('-i')
    const inputIndex = args.indexOf('-i')
    expect(args[inputIndex + 1]).toBe(inputPath)

    const secondInputIndex = args.indexOf('-i', inputIndex + 1)
    expect(args[secondInputIndex + 1]).toBe(backgroundMusicPath)
  })

  it(`includes setpts=PTS/${EDIT_SPEED} for video speed`, () => {
    const args = buildFfmpegArgs({ inputPath, outputPath, backgroundMusicPath })
    const filterIndex = args.indexOf('-filter_complex')

    expect(args[filterIndex + 1]).toContain(`setpts=PTS/${EDIT_SPEED}`)
  })

  it('includes the stronger visual eq filter and no watermark overlay', () => {
    const args = buildFfmpegArgs({ inputPath, outputPath, backgroundMusicPath })
    const filterComplex = args[args.indexOf('-filter_complex') + 1]

    expect(filterComplex).toContain(EDIT_VISUAL_FILTER)
    expect(filterComplex).not.toContain('overlay=')
    expect(filterComplex).not.toContain('colorchannelmixer')
  })

  it(`forces ${OUTPUT_WIDTH}x${OUTPUT_HEIGHT} vertical Shorts/Reels geometry`, () => {
    const args = buildFfmpegArgs({ inputPath, outputPath, backgroundMusicPath })
    const filterComplex = args[args.indexOf('-filter_complex') + 1]

    expect(filterComplex).toContain(EDIT_VERTICAL_GEOMETRY)
    expect(filterComplex).toContain(`scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=increase`)
    expect(filterComplex).toContain(`crop=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}`)
    expect(args).toContain('yuv420p')
  })

  it(`mixes original audio (atempo=${EDIT_SPEED}) with BGM at ${BACKGROUND_MUSIC_VOLUME}`, () => {
    const args = buildFfmpegArgs({
      inputPath,
      outputPath,
      backgroundMusicPath,
      hasAudio: true,
    })
    const filterComplex = args[args.indexOf('-filter_complex') + 1]

    expect(filterComplex).toContain(`atempo=${EDIT_SPEED}`)
    expect(filterComplex).toContain(`volume=${BACKGROUND_MUSIC_VOLUME}`)
    expect(filterComplex).toContain('amix=inputs=2')
    expect(filterComplex).toContain('normalize=0')
    expect(args).toContain('[a_out]')
  })

  it('keeps BGM-only audio when source has no soundtrack', () => {
    const args = buildFfmpegArgs({
      inputPath,
      outputPath,
      backgroundMusicPath,
      hasAudio: false,
    })
    const filterComplex = args[args.indexOf('-filter_complex') + 1]

    expect(filterComplex).not.toContain('atempo=')
    expect(filterComplex).toContain(`volume=${BACKGROUND_MUSIC_VOLUME}`)
    expect(filterComplex).not.toContain('amix=')
    expect(args).toContain('-shortest')
  })
})

describe('FfmpegProcessor', () => {
  let tempDir: string
  let sourcePath: string
  let backgroundMusicPath: string

  beforeEach(async () => {
    runCommandMock.mockReset()
    probeVideoDimensionsMock.mockReset()
    probeVideoDimensionsMock.mockResolvedValue({ width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT })
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ffmpeg-test-'))
    sourcePath = path.join(tempDir, 'source.mp4')
    backgroundMusicPath = path.join(tempDir, 'bgm.mp3')

    await fs.copyFile(path.join(__dirname, 'fixtures/sample.mp4'), sourcePath)
    await fs.writeFile(backgroundMusicPath, Buffer.from('fake-mp3'))
  })

  it('throws FFMPEG_FAILED when source file does not exist', async () => {
    const { FfmpegProcessor } = await import('../src/processors/FfmpegProcessor')
    const processor = new FfmpegProcessor()

    await expect(
      processor.process({
        jobId: 'job-no-source',
        sourcePath: path.join(tempDir, 'missing-source.mp4'),
        tempDir,
        backgroundMusicPath,
      }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.FFMPEG_FAILED,
    } satisfies Partial<ProjectApiError>)
  })

  it('throws BACKGROUND_MUSIC_MISSING when bgm file does not exist', async () => {
    const { FfmpegProcessor } = await import('../src/processors/FfmpegProcessor')
    const processor = new FfmpegProcessor()

    await expect(
      processor.process({
        jobId: 'job-missing-bgm',
        sourcePath,
        tempDir,
        backgroundMusicPath: path.join(tempDir, 'missing.mp3'),
      }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.BACKGROUND_MUSIC_MISSING,
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
        backgroundMusicPath,
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
      backgroundMusicPath,
    })

    expect(result.outputPath).toBe(outputPath)
    expect(runCommandMock.mock.calls[0]?.[1]).toContain(outputPath)
  })

  it('throws FFMPEG_FAILED when output is not vertical Shorts geometry', async () => {
    runCommandMock.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 })
    probeVideoDimensionsMock.mockResolvedValue({ width: 1920, height: 1080 })
    vi.spyOn(fs, 'stat').mockResolvedValue({ size: 2048 } as Awaited<ReturnType<typeof fs.stat>>)

    const { FfmpegProcessor } = await import('../src/processors/FfmpegProcessor')
    const processor = new FfmpegProcessor()

    await expect(
      processor.process({
        jobId: 'job-landscape',
        sourcePath,
        tempDir,
        backgroundMusicPath,
      }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.FFMPEG_FAILED,
      message: expect.stringContaining('1920x1080'),
    })
  })
})
