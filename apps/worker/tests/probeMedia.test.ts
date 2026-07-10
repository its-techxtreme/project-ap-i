import { beforeEach, describe, expect, it, vi } from 'vitest'

const runCommandMock = vi.fn()

vi.mock('../src/utils/runCommand', () => ({
  runCommand: (...args: unknown[]) => runCommandMock(...args),
}))

describe('sourceHasAudio', () => {
  beforeEach(() => {
    runCommandMock.mockReset()
    vi.resetModules()
  })

  it('returns true when ffprobe finds an audio stream', async () => {
    runCommandMock.mockResolvedValue({ stdout: '0\n', stderr: '', exitCode: 0 })

    const { sourceHasAudio } = await import('../src/processors/probeMedia')
    await expect(sourceHasAudio('/tmp/source.mp4')).resolves.toBe(true)

    expect(runCommandMock).toHaveBeenCalledWith(
      'ffprobe',
      expect.arrayContaining(['-select_streams', 'a', '/tmp/source.mp4']),
      expect.objectContaining({ timeout: 30_000 }),
    )
  })

  it('returns false when ffprobe finds no audio stream', async () => {
    runCommandMock.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 })

    const { sourceHasAudio } = await import('../src/processors/probeMedia')
    await expect(sourceHasAudio('/tmp/source.mp4')).resolves.toBe(false)
  })

  it('returns false when ffprobe fails', async () => {
    runCommandMock.mockRejectedValue(new Error('ffprobe failed'))

    const { sourceHasAudio } = await import('../src/processors/probeMedia')
    await expect(sourceHasAudio('/tmp/source.mp4')).resolves.toBe(false)
  })
})

describe('sourceHasAudio (real ffprobe)', () => {
  it.skipIf(process.env.RUN_FFMPEG_INTEGRATION_TESTS !== 'true')(
    'detects audio-less fixture correctly',
    async () => {
      const path = await import('node:path')
      const fixturePath = path.join(__dirname, 'fixtures/sample.mp4')

      const { sourceHasAudio } = await import('../src/processors/probeMedia')
      await expect(sourceHasAudio(fixturePath)).resolves.toBe(false)
    },
  )
})
