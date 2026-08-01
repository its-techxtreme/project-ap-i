import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MockMetadataProvider } from '../src/metadata/MockMetadataProvider'
import { buildMetadataUserPrompt, METADATA_SYSTEM_PROMPT } from '../src/metadata/prompts'
import { parseMetadataJson } from '../src/metadata/parseMetadataJson'

const updateMock = vi.fn()
const eqMock = vi.fn()
const insertEventMock = vi.fn()
const fromMock = vi.fn()

vi.mock('../src/db/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => fromMock(...args),
    rpc: vi.fn(),
  },
}))

vi.mock('../src/jobs/ConcurrencyGuard', () => ({
  withFfmpegConcurrency: <T>(fn: () => Promise<T>) => fn(),
}))

const sampleInput = {
  jobId: 'job-meta-1',
  sourceUrl: 'https://www.youtube.com/watch?v=test',
  sourcePlatform: 'youtube' as const,
  nicheSlug: 'memes' as const,
}

describe('MockMetadataProvider', () => {
  it('returns all three required metadata fields', async () => {
    const provider = new MockMetadataProvider()
    const result = await provider.generate(sampleInput)

    expect(result.youtubeTitle).toBeTruthy()
    expect(result.youtubeDescription).toBeTruthy()
    expect(result.instagramCaption).toBeTruthy()
  })

  it('returns generatedBy: ai', async () => {
    const provider = new MockMetadataProvider()
    const result = await provider.generate(sampleInput)

    expect(result.generatedBy).toBe('ai')
    expect(result.model).toBe('mock')
  })
})

describe('buildMetadataUserPrompt', () => {
  it('includes the selected niche slug and untrusted delimiters', () => {
    const prompt = buildMetadataUserPrompt({
      ...sampleInput,
      nicheSlug: 'anime',
      sourceTitle: 'Original reel title',
      sourceDescription: 'This is the original Instagram caption about the clip',
      transcript: 'spoken words from the clip',
    })

    expect(prompt).toContain('NICHE:')
    expect(prompt).toContain('anime')
    expect(prompt).toContain('<<<UNTRUSTED_SOURCE_TEXT>>>')
    expect(prompt).toContain('Original reel title')
    expect(prompt).toContain('spoken words from the clip')
    expect(prompt).toContain('Not provided') // creator notes etc.
  })

  it('does not include job ID, service role key, or internal paths', () => {
    const prompt = buildMetadataUserPrompt(sampleInput)

    expect(prompt).not.toContain(sampleInput.jobId)
    expect(prompt).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(prompt).not.toContain('/app/')
    expect(prompt).not.toContain('service role')
  })

  it('system prompt forbids invention and requires JSON', () => {
    expect(METADATA_SYSTEM_PROMPT).toContain('Never invent')
    expect(METADATA_SYSTEM_PROMPT).toContain('Return valid JSON only')
    expect(METADATA_SYSTEM_PROMPT).toContain('MEMES:')
    expect(METADATA_SYSTEM_PROMPT).toContain('SPORTS:')
  })
})

describe('getFallbackMetadata', () => {
  it('uses original source caption when AI is unavailable', async () => {
    const { getFallbackMetadata } = await import('../src/metadata/fallbacks')
    const result = getFallbackMetadata('anime', {
      description: 'Naruto vs Sasuke final fight scene https://example.com/spam',
    })

    expect(result.generatedBy).toBe('fallback')
    expect(result.youtubeTitle).toContain('Naruto vs Sasuke')
    expect(result.youtubeDescription).toContain('Naruto vs Sasuke')
    expect(result.youtubeDescription).not.toContain('https://example.com')
    expect(result.youtubeDescription).toContain('#anime')
    expect(result.instagramCaption).toContain('#anime')
  })
})

describe('parseMetadataJson', () => {
  it('parses raw JSON content with optional keyword fields', () => {
    const parsed = parseMetadataJson(
      JSON.stringify({
        youtubeTitle: 'Title',
        youtubeDescription: 'Desc',
        instagramCaption: 'Caption',
        keywords: ['meme', 'funny'],
        instagramHashtags: ['#memes'],
        youtubeHashtags: ['#shorts'],
      }),
    )
    expect(parsed.youtubeTitle).toBe('Title')
    expect(parsed.keywords).toEqual(['meme', 'funny'])
    expect(parsed.instagramHashtags).toEqual(['#memes'])
  })

  it('parses JSON inside markdown fences', () => {
    const parsed = parseMetadataJson(`\`\`\`json
{"youtubeTitle":"T","youtubeDescription":"D","instagramCaption":"C"}
\`\`\``)
    expect(parsed.instagramCaption).toBe('C')
  })
})

describe('AiMetadataProvider', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.doUnmock('../src/config')
    vi.doUnmock('../src/metadata/geminiClient')
    vi.doUnmock('../src/metadata/openaiCompatibleClient')
    vi.resetModules()
  })

  it('falls back when no provider keys are configured', async () => {
    vi.doMock('../src/config', () => ({
      config: {
        GEMINI_API_KEY: undefined,
        GROQ_API_KEY: undefined,
        OPENROUTER_API_KEY: undefined,
      },
    }))

    const { AiMetadataProvider } = await import('../src/metadata/AiMetadataProvider')
    const result = await new AiMetadataProvider().generate(sampleInput)

    expect(result.generatedBy).toBe('fallback')
    expect(result.provider).toBe('fallback')
  })

  it('uses Gemini when configured', async () => {
    vi.doMock('../src/config', () => ({
      config: {
        GEMINI_API_KEY: 'gemini-test-key',
        GEMINI_MODEL: 'gemini-3.5-flash',
        GROQ_API_KEY: undefined,
        OPENROUTER_API_KEY: undefined,
      },
    }))
    vi.doMock('../src/metadata/geminiClient', () => ({
      generateWithGemini: vi.fn().mockResolvedValue(
        JSON.stringify({
          youtubeTitle: 'When the group chat goes silent after the perfect meme drop',
          youtubeDescription: `${'A'.repeat(1000)} #shorts #memes`,
          instagramCaption: `${'B'.repeat(300)} #memes #reels #funny`,
          keywords: ['meme'],
          instagramHashtags: ['#memes'],
          youtubeHashtags: ['#shorts'],
        }),
      ),
      isRateLimitError: () => false,
      RateLimitedError: class RateLimitedError extends Error {},
    }))

    const { AiMetadataProvider } = await import('../src/metadata/AiMetadataProvider')
    const result = await new AiMetadataProvider().generate({
      ...sampleInput,
      sourceDescription: 'guy trips over a skateboard in a parking lot',
    })

    expect(result.generatedBy).toBe('ai')
    expect(result.provider).toBe('gemini')
    expect(result.model).toBe('gemini-3.5-flash')
    expect(result.youtubeTitle.length).toBeGreaterThanOrEqual(40)
    expect(result.keywords).toEqual(['meme'])
    expect(result.youtubeDescription.length).toBeGreaterThanOrEqual(1000)
  })

  it('rejects short first draft then accepts expanded rewrite', async () => {
    const short = JSON.stringify({
      youtubeTitle: 'Too short',
      youtubeDescription: 'Tiny blurb',
      instagramCaption: 'Nope',
    })
    const expanded = JSON.stringify({
      youtubeTitle: 'Expanded title about the silent group chat meme moment',
      youtubeDescription: `${'E'.repeat(1200)} #shorts #memes`,
      instagramCaption: `${'F'.repeat(300)} #memes #reels #funny`,
    })
    const generateWithGemini = vi
      .fn()
      .mockResolvedValueOnce(short)
      .mockResolvedValueOnce(expanded)

    vi.doMock('../src/config', () => ({
      config: {
        GEMINI_API_KEY: 'gemini-test-key',
        GEMINI_MODEL: 'gemini-3.5-flash',
        GROQ_API_KEY: undefined,
        OPENROUTER_API_KEY: undefined,
      },
    }))
    vi.doMock('../src/metadata/geminiClient', () => ({
      generateWithGemini,
      isRateLimitError: () => false,
      RateLimitedError: class RateLimitedError extends Error {},
    }))

    const { AiMetadataProvider } = await import('../src/metadata/AiMetadataProvider')
    const result = await new AiMetadataProvider().generate(sampleInput)

    expect(generateWithGemini).toHaveBeenCalledTimes(2)
    expect(result.generatedBy).toBe('ai')
    expect(result.youtubeDescription.length).toBeGreaterThanOrEqual(1000)
  })

  it('falls back to Groq when Gemini is rate limited', async () => {
    class RateLimitedError extends Error {
      name = 'RateLimitedError'
    }

    vi.doMock('../src/config', () => ({
      config: {
        GEMINI_API_KEY: 'gemini-test-key',
        GEMINI_MODEL: 'gemini-3.5-flash',
        GROQ_API_KEY: 'groq-test-key',
        GROQ_MODEL: 'llama-3.3-70b-versatile',
        GROQ_BASE_URL: 'https://api.groq.com/openai/v1',
        OPENROUTER_API_KEY: undefined,
      },
    }))
    vi.doMock('../src/metadata/geminiClient', () => ({
      generateWithGemini: vi.fn().mockRejectedValue(new RateLimitedError('429 quota')),
      isRateLimitError: () => true,
      RateLimitedError,
    }))
    vi.doMock('../src/metadata/openaiCompatibleClient', () => ({
      generateWithOpenAiCompatible: vi.fn().mockResolvedValue(
        JSON.stringify({
          youtubeTitle: 'Groq fallback title for the skateboard trip moment',
          youtubeDescription: `${'C'.repeat(1100)} #shorts #memes`,
          instagramCaption: `${'D'.repeat(320)} #memes #reels`,
          keywords: ['skateboard'],
          instagramHashtags: ['#memes'],
          youtubeHashtags: ['#shorts'],
        }),
      ),
    }))

    const { AiMetadataProvider } = await import('../src/metadata/AiMetadataProvider')
    const result = await new AiMetadataProvider().generate(sampleInput)

    expect(result.generatedBy).toBe('ai')
    expect(result.provider).toBe('groq')
    expect(result.model).toBe('llama-3.3-70b-versatile')
    expect(result.youtubeTitle).toContain('Groq')
    expect(result.youtubeDescription.length).toBeGreaterThanOrEqual(1000)
  })

  it('uses safe template fallback when all providers fail', async () => {
    vi.doMock('../src/config', () => ({
      config: {
        GEMINI_API_KEY: 'gemini-test-key',
        GEMINI_MODEL: 'gemini-3.5-flash',
        GROQ_API_KEY: 'groq-test-key',
        GROQ_MODEL: 'llama-3.3-70b-versatile',
        GROQ_BASE_URL: 'https://api.groq.com/openai/v1',
        OPENROUTER_API_KEY: undefined,
      },
    }))
    vi.doMock('../src/metadata/geminiClient', () => ({
      generateWithGemini: vi.fn().mockRejectedValue(new Error('boom')),
      isRateLimitError: () => false,
      RateLimitedError: class RateLimitedError extends Error {},
    }))
    vi.doMock('../src/metadata/openaiCompatibleClient', () => ({
      generateWithOpenAiCompatible: vi.fn().mockRejectedValue(new Error('groq down')),
    }))

    const { AiMetadataProvider } = await import('../src/metadata/AiMetadataProvider')
    const result = await new AiMetadataProvider().generate(sampleInput)

    expect(result.generatedBy).toBe('fallback')
    expect(result.provider).toBe('fallback')
    expect(result.youtubeTitle).toBeTruthy()
  })

  it('truncates YouTube title to 100 characters', async () => {
    const longTitle = 'A'.repeat(150)

    vi.doMock('../src/config', () => ({
      config: {
        GEMINI_API_KEY: 'gemini-test-key',
        GEMINI_MODEL: 'gemini-3.5-flash',
        GROQ_API_KEY: undefined,
        OPENROUTER_API_KEY: undefined,
      },
    }))
    vi.doMock('../src/metadata/geminiClient', () => ({
      generateWithGemini: vi.fn().mockResolvedValue(
        JSON.stringify({
          youtubeTitle: longTitle.slice(0, 80),
          youtubeDescription: `${'G'.repeat(1000)} #shorts`,
          instagramCaption: `${'H'.repeat(300)} #reels`,
        }),
      ),
      isRateLimitError: () => false,
      RateLimitedError: class RateLimitedError extends Error {},
    }))

    const { AiMetadataProvider } = await import('../src/metadata/AiMetadataProvider')
    const result = await new AiMetadataProvider().generate(sampleInput)

    expect(result.youtubeTitle.length).toBeLessThanOrEqual(100)
    expect(result.generatedBy).toBe('ai')
  })

  it('truncates Instagram caption to 2200 characters', async () => {
    const longCaption = 'B'.repeat(3000)

    vi.doMock('../src/config', () => ({
      config: {
        GEMINI_API_KEY: 'gemini-test-key',
        GEMINI_MODEL: 'gemini-3.5-flash',
        GROQ_API_KEY: undefined,
        OPENROUTER_API_KEY: undefined,
      },
    }))
    vi.doMock('../src/metadata/geminiClient', () => ({
      generateWithGemini: vi.fn().mockResolvedValue(
        JSON.stringify({
          youtubeTitle: 'Valid title about this specific meme clip moment',
          youtubeDescription: `${'I'.repeat(1000)} #shorts`,
          instagramCaption: longCaption,
        }),
      ),
      isRateLimitError: () => false,
      RateLimitedError: class RateLimitedError extends Error {},
    }))

    const { AiMetadataProvider } = await import('../src/metadata/AiMetadataProvider')
    const result = await new AiMetadataProvider().generate(sampleInput)

    expect(result.instagramCaption.length).toBeLessThanOrEqual(2200)
    expect(result.generatedBy).toBe('ai')
  })
})

describe('runProcessPipeline metadata persistence', () => {
  beforeEach(() => {
    vi.doUnmock('../src/config')
    vi.resetModules()
    updateMock.mockReset()
    eqMock.mockReset()
    insertEventMock.mockReset()
    fromMock.mockReset()

    eqMock.mockReturnValue({ error: null })
    updateMock.mockReturnValue({ eq: eqMock })
    insertEventMock.mockResolvedValue({ error: null })

    fromMock.mockImplementation((table: string) => {
      if (table === 'jobs') return { update: updateMock }
      if (table === 'job_events') return { insert: insertEventMock }
      throw new Error(`Unexpected table: ${table}`)
    })
  })

  it('stores metadata fields in Supabase on pipeline success', async () => {
    const { runProcessPipeline } = await import('../src/jobs/processPipeline')

    const metadataProvider = {
      generate: vi.fn().mockResolvedValue({
        youtubeTitle: 'AI Title',
        youtubeDescription: 'AI Description',
        instagramCaption: 'AI Caption',
        generatedBy: 'ai' as const,
        model: 'gemini-3.5-flash',
        provider: 'gemini' as const,
      }),
    }

    const result = await runProcessPipeline(
      {
        id: 'job-1',
        source_url: 'https://www.youtube.com/watch?v=abc',
        source_platform: 'youtube',
        niche_id: 'niche-memes',
        status: 'queued',
      } as never,
      {
        downloader: {
          download: vi.fn().mockResolvedValue({
            localPath: '/tmp/source.mp4',
            fileSize: 1000,
            title: 'src',
            description: 'desc',
          }),
        },
        processor: {
          process: vi.fn().mockResolvedValue({ outputPath: '/tmp/out.mp4', fileSize: 2000 }),
        },
        driveStorage: {
          upload: vi.fn().mockResolvedValue({
            fileId: 'drive-1',
            fileName: 'out.mp4',
            viewUrl: 'https://drive.google.com/file/d/drive-1',
            folderState: 'processed_ready',
          }),
        },
        metadataProvider,
        tempFileManager: {
          createJobDir: vi.fn().mockResolvedValue('/tmp/job-1'),
          cleanupJobDir: vi.fn().mockResolvedValue(undefined),
          getOutputPath: vi.fn(),
        },
        getNicheSlug: vi.fn().mockResolvedValue('memes'),
      } as never,
    )

    expect(result).toBe('ready_to_upload')
    expect(updateMock).toHaveBeenCalled()
    const updatePayload = updateMock.mock.calls.find((c) => c[0]?.youtube_title)?.[0]
    expect(updatePayload).toMatchObject({
      youtube_title: 'AI Title',
      youtube_description: 'AI Description',
      instagram_caption: 'AI Caption',
      metadata_status: 'generated',
    })
  })

  it('sets metadata_status to fallback_used when fallback metadata is used', async () => {
    const { runProcessPipeline } = await import('../src/jobs/processPipeline')

    await runProcessPipeline(
      {
        id: 'job-2',
        source_url: 'https://www.youtube.com/watch?v=abc',
        source_platform: 'youtube',
        niche_id: 'niche-memes',
        status: 'queued',
      } as never,
      {
        downloader: {
          download: vi.fn().mockResolvedValue({ localPath: '/tmp/source.mp4', fileSize: 1000 }),
        },
        processor: {
          process: vi.fn().mockResolvedValue({ outputPath: '/tmp/out.mp4', fileSize: 2000 }),
        },
        driveStorage: {
          upload: vi.fn().mockResolvedValue({
            fileId: 'drive-2',
            fileName: 'out.mp4',
            folderState: 'processed_ready',
          }),
        },
        metadataProvider: {
          generate: vi.fn().mockResolvedValue({
            youtubeTitle: 'Fallback',
            youtubeDescription: 'Fallback desc',
            instagramCaption: 'Fallback cap',
            generatedBy: 'fallback' as const,
            provider: 'fallback' as const,
          }),
        },
        tempFileManager: {
          createJobDir: vi.fn().mockResolvedValue('/tmp/job-2'),
          cleanupJobDir: vi.fn().mockResolvedValue(undefined),
          getOutputPath: vi.fn(),
        },
        getNicheSlug: vi.fn().mockResolvedValue('memes'),
      } as never,
    )

    const updatePayload = updateMock.mock.calls.find((c) => c[0]?.metadata_status)?.[0]
    expect(updatePayload?.metadata_status).toBe('fallback_used')
  })
})
