import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

describe('GoogleDriveStorage (integration)', () => {
  it('uploads fixture mp4 to processed folder then deletes it', async () => {
    vi.resetModules()

    const fixturePath = path.join(__dirname, 'fixtures/sample.mp4')
    const jobId = `integration-${Date.now()}`

    const { GoogleDriveStorage } = await import('../src/storage/GoogleDriveStorage')
    const storage = new GoogleDriveStorage()

    const uploaded = await storage.upload({
      jobId,
      nicheSlug: 'memes',
      localFilePath: fixturePath,
    })

    expect(uploaded.fileId).toBeTruthy()
    expect(uploaded.fileName).toMatch(/^AP-I_memes_/)
    expect(uploaded.folderState).toBe('processed_ready')

    await storage.delete(uploaded.fileId, jobId)
  }, 60_000)
})
