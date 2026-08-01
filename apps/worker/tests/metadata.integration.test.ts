import { describe, expect, it, vi } from 'vitest'

import { isAiProviderConfigured } from '../src/metadata/AiMetadataProvider'

const integrationEnabled = isAiProviderConfigured()

describe.skipIf(!integrationEnabled)('AiMetadataProvider (live Gemini/Groq integration)', () => {
  it('generates all three metadata fields via configured AI providers', async () => {
    vi.resetModules()

    const { AiMetadataProvider } = await import('../src/metadata/AiMetadataProvider')
    const provider = new AiMetadataProvider()

    const result = await provider.generate({
      jobId: 'integration-metadata-job',
      sourceUrl: 'https://www.youtube.com/shorts/test',
      sourcePlatform: 'youtube',
      nicheSlug: 'memes',
      sourceTitle: 'When the group chat goes silent after you send a meme',
      sourceDescription:
        'POV: you drop the perfect meme and everyone leaves you on read. Relatable group chat moment.',
    })

    expect(result.generatedBy).toBe('ai')
    expect(['gemini', 'groq', 'openrouter']).toContain(result.provider)
    expect(result.youtubeTitle.length).toBeGreaterThan(0)
    expect(result.youtubeTitle.length).toBeLessThanOrEqual(100)
    expect(result.youtubeDescription.length).toBeGreaterThan(0)
    expect(result.instagramCaption.length).toBeGreaterThan(0)
    expect(result.instagramCaption.length).toBeLessThanOrEqual(2200)
    expect(result.model).toBeTruthy()
    expect(result.youtubeTitle).not.toContain('[MOCK]')
    expect(result.youtubeTitle).not.toContain('integration-metadata-job')
  }, 90_000)
})

describe('AiMetadataProvider (live integration prerequisites)', () => {
  it.skipIf(integrationEnabled)(
    'skips live test when GEMINI_API_KEY / GROQ_API_KEY are not configured in .env',
    () => {
      expect(integrationEnabled).toBe(false)
    },
  )
})
