import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { pickSourceCaptionText, readYtDlpSourceInfo } from '../src/downloaders/sourceInfo'

describe('pickSourceCaptionText', () => {
  it('prefers description over title', () => {
    expect(
      pickSourceCaptionText({
        title: 'Short title',
        description: 'Longer original caption about the clip',
      }),
    ).toBe('Longer original caption about the clip')
  })

  it('falls back to title when description is missing', () => {
    expect(pickSourceCaptionText({ title: 'Only title here' })).toBe('Only title here')
  })
})

describe('readYtDlpSourceInfo', () => {
  it('reads title, description, and uploader from info.json', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'source-info-'))
    await fs.writeFile(
      path.join(tempDir, 'source.info.json'),
      JSON.stringify({
        title: 'YT title',
        description: 'YT description body',
        channel: 'My Channel',
      }),
    )

    const info = await readYtDlpSourceInfo(tempDir)
    expect(info).toEqual({
      title: 'YT title',
      description: 'YT description body',
      uploader: 'My Channel',
    })

    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it('returns empty object when info.json is missing', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'source-info-missing-'))
    const info = await readYtDlpSourceInfo(tempDir)
    expect(info).toEqual({})
    await fs.rm(tempDir, { recursive: true, force: true })
  })
})
