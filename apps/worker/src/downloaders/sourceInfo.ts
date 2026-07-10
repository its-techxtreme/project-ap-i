import fs from 'node:fs/promises'
import path from 'node:path'

/** Read yt-dlp `--write-info-json` sidecar for title/caption/uploader. */
export async function readYtDlpSourceInfo(tempDir: string): Promise<{
  title?: string
  description?: string
  uploader?: string
}> {
  let entries: string[]
  try {
    entries = await fs.readdir(tempDir)
  } catch {
    return {}
  }

  const infoFile = entries.find((name) => name.endsWith('.info.json'))
  if (!infoFile) return {}

  try {
    const raw = JSON.parse(await fs.readFile(path.join(tempDir, infoFile), 'utf8')) as Record<
      string,
      unknown
    >
    const title = typeof raw.title === 'string' ? raw.title.trim() : undefined
    const description =
      typeof raw.description === 'string'
        ? raw.description.trim()
        : typeof raw.fulltitle === 'string'
          ? raw.fulltitle.trim()
          : undefined
    const uploader =
      typeof raw.uploader === 'string'
        ? raw.uploader.trim()
        : typeof raw.channel === 'string'
          ? raw.channel.trim()
          : typeof raw.creator === 'string'
            ? raw.creator.trim()
            : undefined

    return {
      title: title || undefined,
      description: description || undefined,
      uploader: uploader || undefined,
    }
  } catch {
    return {}
  }
}

/**
 * Best text to rephrase for social metadata:
 * prefer description/caption, else title.
 */
export function pickSourceCaptionText(info: {
  title?: string
  description?: string
}): string | undefined {
  const description = info.description?.replace(/\s+/g, ' ').trim()
  const title = info.title?.replace(/\s+/g, ' ').trim()
  if (description && description.length >= 8) return description
  if (title && title.length >= 3) return title
  return description || title || undefined
}
