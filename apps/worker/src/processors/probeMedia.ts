import { runCommand } from '../utils/runCommand'

/** Returns true when the source file contains at least one audio stream. */
export async function sourceHasAudio(inputPath: string): Promise<boolean> {
  try {
    const result = await runCommand(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'a',
        '-show_entries',
        'stream=index',
        '-of',
        'csv=p=0',
        inputPath,
      ],
      { timeout: 30_000 },
    )

    return result.stdout.trim().length > 0
  } catch {
    return false
  }
}

/** Best-effort width/height of the first video stream. */
export async function probeVideoDimensions(
  inputPath: string,
): Promise<{ width: number; height: number } | null> {
  try {
    const result = await runCommand(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height',
        '-of',
        'csv=p=0:s=x',
        inputPath,
      ],
      { timeout: 30_000 },
    )
    const match = result.stdout.trim().match(/^(\d+)x(\d+)/)
    if (!match) return null
    const width = Number.parseInt(match[1]!, 10)
    const height = Number.parseInt(match[2]!, 10)
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return null
    }
    return { width, height }
  } catch {
    return null
  }
}
