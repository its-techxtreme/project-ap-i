import { GoogleGenAI } from '@google/genai'

import { METADATA_SYSTEM_PROMPT } from './prompts'

export class RateLimitedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RateLimitedError'
  }
}

export function isRateLimitError(err: unknown): boolean {
  if (err instanceof RateLimitedError) return true
  const msg = String(err).toLowerCase()
  return (
    msg.includes('429') ||
    msg.includes('rate limit') ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota') ||
    msg.includes('too many requests')
  )
}

const METADATA_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    youtubeTitle: { type: 'string' },
    youtubeDescription: { type: 'string' },
    instagramCaption: { type: 'string' },
    keywords: { type: 'array', items: { type: 'string' } },
    instagramHashtags: { type: 'array', items: { type: 'string' } },
    youtubeHashtags: { type: 'array', items: { type: 'string' } },
  },
  required: ['youtubeTitle', 'youtubeDescription', 'instagramCaption'],
} as const

export async function generateWithGemini(opts: {
  apiKey: string
  model: string
  userPrompt: string
}): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: opts.apiKey })

  try {
    const response = await ai.models.generateContent({
      model: opts.model,
      contents: opts.userPrompt,
      config: {
        systemInstruction: METADATA_SYSTEM_PROMPT,
        temperature: 0.45,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
        responseSchema: METADATA_RESPONSE_SCHEMA,
      },
    })

    const text = response.text?.trim()
    if (!text) throw new Error('Empty Gemini response')
    return text
  } catch (err) {
    if (isRateLimitError(err)) {
      throw new RateLimitedError(String(err))
    }
    throw err
  }
}
