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
