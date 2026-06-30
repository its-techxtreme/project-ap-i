import fs from 'node:fs/promises'
import path from 'node:path'

import type { Downloader, DownloadInput, DownloadOutput } from './types'

async function getFixturePath(): Promise<string> {
  const candidates = [
    path.join(__dirname, '../../tests/fixtures/sample.mp4'),
    path.join(process.cwd(), 'tests/fixtures/sample.mp4'),
    path.join(process.cwd(), 'apps/worker/tests/fixtures/sample.mp4'),
  ]

  for (const candidate of candidates) {
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      continue
    }
  }

  throw new Error(`Mock fixture not found. Checked: ${candidates.join(', ')}`)
}

export class MockDownloader implements Downloader {
  async download(input: DownloadInput): Promise<DownloadOutput> {
    const fixturePath = await getFixturePath()
    const dest = path.join(input.tempDir, 'source.mp4')
    await fs.copyFile(fixturePath, dest)
    const stat = await fs.stat(dest)
    return { localPath: dest, fileSize: stat.size, duration: 30, title: 'Mock video' }
  }
}
