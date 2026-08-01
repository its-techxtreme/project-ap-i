import { config } from '../config'
import { logger } from '../logging/logger'

import { getFallbackMetadata } from './fallbacks'
import { generateWithGemini, isRateLimitError } from './geminiClient'
import { generateWithOpenAiCompatible } from './openaiCompatibleClient'
import { clampMetadataFields, parseMetadataJson } from './parseMetadataJson'
import { buildMetadataUserPrompt } from './prompts'
import {
  MetadataQualityError,
  assertMetadataQuality,
  buildLengthExpansionPrompt,
} from './quality'
import { filterSourceForNiche } from './sourceRelevance'
import type { MetadataAiProvider, MetadataInput, MetadataOutput, MetadataProvider } from './types'

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash'
export const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile'
export const DEFAULT_GROQ_BASE_URL = 'https://api.groq.com/openai/v1'
export const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

/** @deprecated Prefer DEFAULT_GEMINI_MODEL — kept for older imports. */
export const DEFAULT_AI_MODEL = DEFAULT_GEMINI_MODEL

function hasUsableKey(key: string | undefined): boolean {
  return Boolean(key && key !== 'REPLACE_ME' && key.trim().length > 0)
}

export function isGeminiConfigured(): boolean {
  return hasUsableKey(config.GEMINI_API_KEY)
}

export function isGroqConfigured(): boolean {
  return hasUsableKey(config.GROQ_API_KEY)
}

export function isOpenRouterConfigured(): boolean {
  return hasUsableKey(config.OPENROUTER_API_KEY)
}

export function isAiProviderConfigured(): boolean {
  return isGeminiConfigured() || isGroqConfigured() || isOpenRouterConfigured()
}

function toOutput(
  parsed: ReturnType<typeof clampMetadataFields>,
  provider: MetadataAiProvider,
  model: string,
): MetadataOutput {
  return {
    youtubeTitle: parsed.youtubeTitle,
    youtubeDescription: parsed.youtubeDescription,
    instagramCaption: parsed.instagramCaption,
    keywords: parsed.keywords,
    instagramHashtags: parsed.instagramHashtags,
    youtubeHashtags: parsed.youtubeHashtags,
    generatedBy: 'ai',
    model,
    provider,
  }
}

async function generateAndValidate(opts: {
  input: MetadataInput
  provider: MetadataAiProvider
  model: string
  generate: (prompt: string) => Promise<string>
}): Promise<MetadataOutput> {
  const basePrompt = buildMetadataUserPrompt(opts.input)
  let prompt = basePrompt
  let lastRaw = ''

  for (let attempt = 1; attempt <= 3; attempt++) {
    const content = await opts.generate(prompt)
    lastRaw = content
    const parsed = clampMetadataFields(parseMetadataJson(content))
    try {
      assertMetadataQuality(parsed, opts.input.nicheSlug)
      logger.info({
        msg: 'Metadata generated and passed length checks',
        jobId: opts.input.jobId,
        provider: opts.provider,
        model: opts.model,
        attempt,
        titleLen: parsed.youtubeTitle.length,
        descriptionLen: parsed.youtubeDescription.length,
        captionLen: parsed.instagramCaption.length,
      })
      return toOutput(parsed, opts.provider, opts.model)
    } catch (err) {
      if (!(err instanceof MetadataQualityError) || attempt === 3) {
        throw err
      }
      logger.warn({
        msg: 'Metadata failed length checks — requesting expansion rewrite',
        jobId: opts.input.jobId,
        provider: opts.provider,
        model: opts.model,
        lengths: err.lengths,
      })
      prompt = buildLengthExpansionPrompt(lastRaw, opts.input.nicheSlug)
    }
  }

  throw new Error('Metadata generation exhausted without valid lengths')
}

export class AiMetadataProvider implements MetadataProvider {
  async generate(input: MetadataInput): Promise<MetadataOutput> {
    const filtered = filterSourceForNiche(input.nicheSlug, {
      title: input.sourceTitle,
      description: input.sourceDescription,
    })
    const filteredInput: MetadataInput = {
      ...input,
      // Prefer a real subject line over weak "Video by …" titles
      sourceTitle: filtered.contentHook ?? filtered.title,
      sourceDescription: filtered.description,
    }
    const sourceForFallback = {
      title: filtered.contentHook ?? filtered.title,
      description: filtered.description,
      sourceUrl: input.sourceUrl,
      sourcePlatform: input.sourcePlatform,
    }

    if (!filtered.usedSource && (input.sourceTitle || input.sourceDescription)) {
      logger.warn({
        msg: 'Ignored unrelated/junk source metadata for niche',
        jobId: input.jobId,
        nicheSlug: input.nicheSlug,
      })
    }

    if (!isAiProviderConfigured()) {
      logger.warn({ msg: 'No Gemini/Groq/OpenRouter key configured, using fallback', jobId: input.jobId })
      return {
        ...getFallbackMetadata(input.nicheSlug, sourceForFallback),
        provider: 'fallback',
      }
    }

    logger.info({
      msg: 'Generating AI metadata',
      jobId: input.jobId,
      nicheSlug: input.nicheSlug,
      hasSourceTitle: Boolean(filteredInput.sourceTitle?.trim()),
      hasSourceDescription: Boolean(filteredInput.sourceDescription?.trim()),
      hasTranscript: Boolean(input.transcript?.trim()),
      hasCreatorNotes: Boolean(input.creatorNotes?.trim()),
      geminiConfigured: isGeminiConfigured(),
      groqConfigured: isGroqConfigured(),
      openRouterConfigured: isOpenRouterConfigured(),
    })

    if (isGeminiConfigured()) {
      const model = config.GEMINI_MODEL || DEFAULT_GEMINI_MODEL
      try {
        return await generateAndValidate({
          input: filteredInput,
          provider: 'gemini',
          model,
          generate: (userPrompt) =>
            generateWithGemini({
              apiKey: config.GEMINI_API_KEY!,
              model,
              userPrompt,
            }),
        })
      } catch (err) {
        logger.warn({
          msg: 'Gemini metadata generation failed',
          jobId: input.jobId,
          model,
          rateLimited: isRateLimitError(err),
          qualityFailed: err instanceof MetadataQualityError,
          err: String(err),
        })
      }
    }

    if (isGroqConfigured()) {
      const model = config.GROQ_MODEL || DEFAULT_GROQ_MODEL
      const baseURL = config.GROQ_BASE_URL || DEFAULT_GROQ_BASE_URL
      try {
        return await generateAndValidate({
          input: filteredInput,
          provider: 'groq',
          model,
          generate: (userPrompt) =>
            generateWithOpenAiCompatible({
              apiKey: config.GROQ_API_KEY!,
              baseURL,
              model,
              userPrompt,
            }),
        })
      } catch (err) {
        logger.warn({
          msg: 'Groq metadata generation failed',
          jobId: input.jobId,
          model,
          qualityFailed: err instanceof MetadataQualityError,
          err: String(err),
        })
      }
    }

    if (isOpenRouterConfigured()) {
      const model = config.OPENROUTER_MODEL || 'google/gemini-2.5-flash'
      const baseURL = config.OPENROUTER_BASE_URL || DEFAULT_OPENROUTER_BASE_URL
      try {
        return await generateAndValidate({
          input: filteredInput,
          provider: 'openrouter',
          model,
          generate: (userPrompt) =>
            generateWithOpenAiCompatible({
              apiKey: config.OPENROUTER_API_KEY!,
              baseURL,
              model,
              userPrompt,
              defaultHeaders: {
                'HTTP-Referer': 'https://project-ap-i.vercel.app',
                'X-Title': 'Project AP-I',
              },
            }),
        })
      } catch (err) {
        logger.warn({
          msg: 'OpenRouter metadata generation failed',
          jobId: input.jobId,
          model,
          qualityFailed: err instanceof MetadataQualityError,
          err: String(err),
        })
      }
    }

    logger.warn({
      msg: 'All AI metadata providers failed, using safe fallback',
      jobId: input.jobId,
    })
    return {
      ...getFallbackMetadata(input.nicheSlug, sourceForFallback),
      provider: 'fallback',
    }
  }
}
