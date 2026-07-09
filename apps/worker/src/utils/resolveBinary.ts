import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const binaryCache = new Map<string, string>()

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await fs.access(candidate)
    return true
  } catch {
    return false
  }
}

async function lookupOnPath(binary: string): Promise<string | null> {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync('where.exe', [binary], {
        windowsHide: true,
        env: process.env,
      })
      const first = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0 && line.toLowerCase().endsWith('.exe'))
      return first ?? null
    }

    const { stdout } = await execFileAsync('which', [binary], {
      env: process.env,
    })
    const first = stdout.trim().split(/\r?\n/)[0]
    return first || null
  } catch {
    return null
  }
}

/**
 * Resolve CLI binaries to absolute paths.
 * On Windows, WinGet shims named `yt-dlp` can spawn with exit 0 and empty I/O;
 * the real `.exe` must be used.
 */
export async function resolveBinary(binary: string): Promise<string> {
  const cached = binaryCache.get(binary)
  if (cached) return cached

  if (path.isAbsolute(binary) && (await pathExists(binary))) {
    binaryCache.set(binary, binary)
    return binary
  }

  const fromPath = await lookupOnPath(binary)
  if (fromPath) {
    binaryCache.set(binary, fromPath)
    return fromPath
  }

  // Fall back to bare name — spawn may still work on Unix.
  binaryCache.set(binary, binary)
  return binary
}
