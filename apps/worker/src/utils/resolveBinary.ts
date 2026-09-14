import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import os from 'node:os'

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

async function lookupWinGetPackage(binary: string): Promise<string | null> {
  if (process.platform !== 'win32') return null
  const exe = binary.toLowerCase().endsWith('.exe') ? binary : `${binary}.exe`
  const roots = [
    path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages'),
    path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Links'),
  ]

  for (const root of roots) {
    try {
      const entries = await fs.readdir(root, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name.toLowerCase() === exe.toLowerCase()) {
          const full = path.join(root, entry.name)
          if (await pathExists(full)) return full
        }
        if (!entry.isDirectory()) continue
        // Prefer packages that mention the binary name (e.g. yt-dlp.yt-dlp_...)
        if (!entry.name.toLowerCase().includes(binary.toLowerCase().replace(/\.exe$/, ''))) {
          continue
        }
        const candidate = path.join(root, entry.name, exe)
        if (await pathExists(candidate)) return candidate
      }
    } catch {
      // root missing
    }
  }
  return null
}

function envOverride(binary: string): string | undefined {
  const key = binary.replace(/\.exe$/i, '').toUpperCase().replace(/-/g, '_') + '_PATH'
  // yt-dlp → YT_DLP_PATH, ffmpeg → FFMPEG_PATH
  const aliases: Record<string, string> = {
    'yt-dlp': 'YT_DLP_PATH',
    ffmpeg: 'FFMPEG_PATH',
    ffprobe: 'FFPROBE_PATH',
  }
  const envKey = aliases[binary] ?? key
  const value = process.env[envKey]?.trim()
  return value || undefined
}

/** Absolute path for CLIs. WinGet yt-dlp shim exits 0 with empty I/O so we want the real .exe. Also search Packages when PATH is thin (detached worker). */
export async function resolveBinary(binary: string): Promise<string> {
  const cached = binaryCache.get(binary)
  if (cached) return cached

  const fromEnv = envOverride(binary)
  if (fromEnv && (await pathExists(fromEnv))) {
    binaryCache.set(binary, fromEnv)
    return fromEnv
  }

  if (path.isAbsolute(binary) && (await pathExists(binary))) {
    binaryCache.set(binary, binary)
    return binary
  }

  const fromPath = await lookupOnPath(binary)
  if (fromPath) {
    binaryCache.set(binary, fromPath)
    return fromPath
  }

  const fromWinGet = await lookupWinGetPackage(binary)
  if (fromWinGet) {
    binaryCache.set(binary, fromWinGet)
    return fromWinGet
  }

  // Fall back to bare name — spawn may still work on Unix.
  binaryCache.set(binary, binary)
  return binary
}
