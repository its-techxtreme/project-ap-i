import { config } from '../config'
import { logger } from '../logging/logger'

import { getFallbackMetadata } from './fallbacks'
import { parseMetadataJson } from './parseMetadataJson'
import { buildMetadataPrompt } from './prompts'
import type { MetadataInput, MetadataOutput, MetadataProvider } from './types'

/** Matches scripts/setup-local-env.mjs and infra/ai/NVIDIA_NIM.md */
export const DEFAULT_AI_MODEL = 'meta/llama-3.1-8b-instruct'

const METADATA_SYSTEM_PROMPT =
  'You write social video metadata. Output valid JSON only with keys youtubeTitle, youtubeDescription, instagramCaption.'

export function isAiProviderConfigured(): boolean {
  const key = config.AI_PROVIDER_API_KEY
  return Boolean(
    config.AI_PROVIDER_BASE_URL &&
      key &&
      key !== 'REPLACE_ME' &&
      key.trim().length > 0,
  )
}

function aiBaseUrl(): string {
  return (config.AI_PROVIDER_BASE_URL ?? '').replace(/\/$/, '')
}

export class AiMetadataProvider implements MetadataProvider {
  async generate(input: MetadataInput): Promise<MetadataOutput> {
    if (!isAiProviderConfigured()) {
      logger.warn({ msg: 'AI provider not configured, using fallback', jobId: input.jobId })
      return getFallbackMetadata(input.nicheSlug)
    }

    const prompt = buildMetadataPrompt(input)
    const model = config.AI_MODEL ?? DEFAULT_AI_MODEL
    const maxAttempts = 2

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(`${aiBaseUrl()}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.AI_PROVIDER_API_KEY}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: METADATA_SYSTEM_PROMPT },
              { role: 'user', content: prompt },
            ],
            temperature: 0.4,
            max_tokens: 512,
          }),
          signal: AbortSignal.timeout(60_000),
        })

        if (!response.ok) {
          if (response.status === 429) {
            logger.warn({
              msg: 'AI provider rate limited',
              jobId: input.jobId,
              status: 429,
              attempt,
            })
          }
          throw new Error(`AI API returned ${response.status}`)
        }

        const data = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>
        }
        const content = data.choices?.[0]?.message?.content?.trim()

        if (!content) throw new Error('Empty AI response')

        const parsed = parseMetadataJson(content)

        return {
          youtubeTitle: parsed.youtubeTitle.substring(0, 100),
          youtubeDescription: parsed.youtubeDescription.substring(0, 5000),
          instagramCaption: parsed.instagramCaption.substring(0, 2200),
          generatedBy: 'ai',
          model,
        }
      } catch (err) {
        logger.warn({
          msg: 'AI metadata generation attempt failed',
          jobId: input.jobId,
          attempt,
          maxAttempts,
          err: String(err),
        })
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 1500 * attempt))
          continue
        }
        logger.warn({
          msg: 'AI metadata generation failed, using fallback',
          jobId: input.jobId,
          err: String(err),
        })
        return getFallbackMetadata(input.nicheSlug)
      }
    }

    return getFallbackMetadata(input.nicheSlug)
  }
}
