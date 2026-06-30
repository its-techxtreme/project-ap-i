import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MockMetadataProvider } from '../src/metadata/MockMetadataProvider'
import { buildMetadataPrompt } from '../src/metadata/prompts'
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

describe('buildMetadataPrompt', () => {
  it('includes the selected niche slug', () => {
    const prompt = buildMetadataPrompt({ ...sampleInput, nicheSlug: 'anime' })

    expect(prompt).toContain('Niche: anime')
    expect(prompt).toContain('anime edits')
  })

  it('does not include job ID, service role key, or internal paths', () => {
    const prompt = buildMetadataPrompt(sampleInput)

    expect(prompt).not.toContain(sampleInput.jobId)
    expect(prompt).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(prompt).not.toContain('/app/')
    expect(prompt).not.toContain('service role')
  })
})

describe('parseMetadataJson', () => {
  it('parses raw JSON content', () => {
    const parsed = parseMetadataJson(
      JSON.stringify({
        youtubeTitle: 'Title',
        youtubeDescription: 'Desc',
        instagramCaption: 'Caption',
      }),
    )
    expect(parsed.youtubeTitle).toBe('Title')
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
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.doUnmock('../src/config')
    vi.resetModules()
  })

  it('falls back to template when AI_PROVIDER_API_KEY is REPLACE_ME', async () => {
    vi.doMock('../src/config', () => ({
      config: {
        AI_PROVIDER_BASE_URL: 'https://integrate.api.nvidia.com/v1',
        AI_PROVIDER_API_KEY: 'REPLACE_ME',
        AI_MODEL: 'meta/llama-3.1-8b-instruct',
      },
    }))

    const { AiMetadataProvider } = await import('../src/metadata/AiMetadataProvider')
    const result = await new AiMetadataProvider().generate(sampleInput)

    expect(result.generatedBy).toBe('fallback')
  })

  it('falls back to template when AI_PROVIDER_BASE_URL is not set', async () => {
    vi.doMock('../src/config', () => ({
      config: {
        AI_PROVIDER_BASE_URL: undefined,
        AI_PROVIDER_API_KEY: undefined,
        AI_MODEL: undefined,
      },
    }))

    const { AiMetadataProvider } = await import('../src/metadata/AiMetadataProvider')
    const result = await new AiMetadataProvider().generate(sampleInput)

    expect(result.generatedBy).toBe('fallback')
    expect(result.youtubeTitle).toContain('laughing')
  })

  it('falls back to template on HTTP error', async () => {
    vi.doMock('../src/config', () => ({
      config: {
        AI_PROVIDER_BASE_URL: 'https://api.example.com/v1',
        AI_PROVIDER_API_KEY: 'test-key',
        AI_MODEL: 'gpt-4o-mini',
      },
    }))

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }),
    )

    const { AiMetadataProvider } = await import('../src/metadata/AiMetadataProvider')
    const result = await new AiMetadataProvider().generate(sampleInput)

    expect(result.generatedBy).toBe('fallback')
  })

  it('falls back to template on malformed JSON response', async () => {
    vi.doMock('../src/config', () => ({
      config: {
        AI_PROVIDER_BASE_URL: 'https://api.example.com/v1',
        AI_PROVIDER_API_KEY: 'test-key',
        AI_MODEL: 'gpt-4o-mini',
      },
    }))

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'not valid json {{{' } }],
        }),
      }),
    )

    const { AiMetadataProvider } = await import('../src/metadata/AiMetadataProvider')
    const result = await new AiMetadataProvider().generate(sampleInput)

    expect(result.generatedBy).toBe('fallback')
  })

  it('truncates YouTube title to 100 characters', async () => {
    const longTitle = 'A'.repeat(150)

    vi.doMock('../src/config', () => ({
      config: {
        AI_PROVIDER_BASE_URL: 'https://api.example.com/v1',
        AI_PROVIDER_API_KEY: 'test-key',
        AI_MODEL: 'gpt-4o-mini',
      },
    }))

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  youtubeTitle: longTitle,
                  youtubeDescription: 'Valid description #shorts',
                  instagramCaption: 'Valid caption #reels',
                }),
              },
            },
          ],
        }),
      }),
    )

    const { AiMetadataProvider } = await import('../src/metadata/AiMetadataProvider')
    const result = await new AiMetadataProvider().generate(sampleInput)

    expect(result.youtubeTitle.length).toBeLessThanOrEqual(100)
    expect(result.generatedBy).toBe('ai')
  })

  it('truncates Instagram caption to 2200 characters', async () => {
    const longCaption = 'B'.repeat(3000)

    vi.doMock('../src/config', () => ({
      config: {
        AI_PROVIDER_BASE_URL: 'https://api.example.com/v1',
        AI_PROVIDER_API_KEY: 'test-key',
        AI_MODEL: 'gpt-4o-mini',
      },
    }))

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  youtubeTitle: 'Valid title',
                  youtubeDescription: 'Valid description #shorts',
                  instagramCaption: longCaption,
                }),
              },
            },
          ],
        }),
      }),
    )

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
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'meta-pipeline-'))
    const sourcePath = path.join(tempDir, 'source.mp4')
    const outputPath = path.join(tempDir, 'job_job-meta-pipe_edited.mp4')
    await fs.writeFile(sourcePath, Buffer.from('source'))
    await fs.writeFile(outputPath, Buffer.from('edited'))

    const { MockDriveStorage } = await import('../src/storage/MockDriveStorage')
    const { runProcessPipeline } = await import('../src/jobs/processPipeline')

    await runProcessPipeline(
      {
        id: 'job-meta-pipe',
        source_url: 'https://www.youtube.com/watch?v=test',
        source_platform: 'youtube',
        niche_id: 'niche-memes',
        rights_confirmed: true,
        status: 'queued',
        download_status: 'pending',
        processing_status: 'pending',
        metadata_status: 'pending',
        youtube_upload_status: 'pending',
        instagram_upload_status: 'pending',
        verification_status: 'pending',
        retry_count: 0,
        youtube_retry_count: 0,
        instagram_retry_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        downloader: {
          download: vi.fn().mockResolvedValue({ localPath: sourcePath, fileSize: 100 }),
        },
        processor: {
          process: vi.fn().mockResolvedValue({ outputPath, fileSize: 200 }),
        },
        driveStorage: new MockDriveStorage(),
        metadataProvider: new MockMetadataProvider(),
        tempFileManager: {
          createJobDir: vi.fn().mockResolvedValue(tempDir),
          cleanupJobDir: vi.fn().mockResolvedValue(undefined),
          getOutputPath: vi.fn().mockReturnValue(outputPath),
        },
        getNicheSlug: vi.fn().mockResolvedValue('memes'),
      },
    )

    const readyUpdate = updateMock.mock.calls.find(
      (call) => (call[0] as { status: string }).status === 'ready_to_upload',
    )

    expect(readyUpdate?.[0]).toMatchObject({
      youtube_title: '[MOCK] memes video - test title',
      youtube_description: expect.stringContaining('[MOCK]'),
      instagram_caption: expect.stringContaining('[MOCK]'),
      metadata_status: 'generated',
    })

    const metadataEvent = insertEventMock.mock.calls.find(
      (call) => call[0].event_type === 'metadata_generation_completed',
    )
    expect(metadataEvent?.[0]).toMatchObject({
      stage: 'metadata',
      event_type: 'metadata_generation_completed',
    })

    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it('sets metadata_status to fallback_used when fallback metadata is used', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'meta-fallback-'))
    const sourcePath = path.join(tempDir, 'source.mp4')
    const outputPath = path.join(tempDir, 'job_job-meta-fb_edited.mp4')
    await fs.writeFile(sourcePath, Buffer.from('source'))
    await fs.writeFile(outputPath, Buffer.from('edited'))

    const { MockDriveStorage } = await import('../src/storage/MockDriveStorage')
    const { getFallbackMetadata } = await import('../src/metadata/fallbacks')
    const { runProcessPipeline } = await import('../src/jobs/processPipeline')

    const fallbackProvider = {
      generate: vi.fn().mockResolvedValue(getFallbackMetadata('sports')),
    }

    await runProcessPipeline(
      {
        id: 'job-meta-fb',
        source_url: 'https://www.youtube.com/watch?v=test',
        source_platform: 'youtube',
        niche_id: 'niche-sports',
        rights_confirmed: true,
        status: 'queued',
        download_status: 'pending',
        processing_status: 'pending',
        metadata_status: 'pending',
        youtube_upload_status: 'pending',
        instagram_upload_status: 'pending',
        verification_status: 'pending',
        retry_count: 0,
        youtube_retry_count: 0,
        instagram_retry_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        downloader: {
          download: vi.fn().mockResolvedValue({ localPath: sourcePath, fileSize: 100 }),
        },
        processor: {
          process: vi.fn().mockResolvedValue({ outputPath, fileSize: 200 }),
        },
        driveStorage: new MockDriveStorage(),
        metadataProvider: fallbackProvider,
        tempFileManager: {
          createJobDir: vi.fn().mockResolvedValue(tempDir),
          cleanupJobDir: vi.fn().mockResolvedValue(undefined),
          getOutputPath: vi.fn().mockReturnValue(outputPath),
        },
        getNicheSlug: vi.fn().mockResolvedValue('sports'),
      },
    )

    const readyUpdate = updateMock.mock.calls.find(
      (call) => (call[0] as { status: string }).status === 'ready_to_upload',
    )

    expect(readyUpdate?.[0]).toMatchObject({
      metadata_status: 'fallback_used',
      youtube_title: expect.stringContaining('sports'),
    })

    await fs.rm(tempDir, { recursive: true, force: true })
  })
})
