import OpenAI from 'openai'

import { METADATA_SYSTEM_PROMPT } from './prompts'
import { RateLimitedError, isRateLimitError } from './geminiClient'

export async function generateWithOpenAiCompatible(opts: {
  apiKey: string
  baseURL: string
  model: string
  userPrompt: string
  /** Optional OpenRouter / proxy headers */
  defaultHeaders?: Record<string, string>
}): Promise<string> {
  const client = new OpenAI({
    apiKey: opts.apiKey,
    baseURL: opts.baseURL.replace(/\/$/, ''),
    defaultHeaders: opts.defaultHeaders,
  })

  try {
    const completion = await client.chat.completions.create(
      {
        model: opts.model,
        temperature: 0.4,
        max_tokens: 8192,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: METADATA_SYSTEM_PROMPT },
          { role: 'user', content: opts.userPrompt },
        ],
      },
      { timeout: 90_000 },
    )

    const content = completion.choices[0]?.message?.content?.trim()
    if (!content) throw new Error('Empty OpenAI-compatible response')
    return content
  } catch (err) {
    if (isRateLimitError(err)) {
      throw new RateLimitedError(String(err))
    }
    throw err
  }
}
