export interface ParsedMetadataFields {
  youtubeTitle: string
  youtubeDescription: string
  instagramCaption: string
  keywords: string[]
  instagramHashtags: string[]
  youtubeHashtags: string[]
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

/** Parses model output that may be raw JSON or fenced in a markdown code block. */
export function parseMetadataJson(content: string): ParsedMetadataFields {
  const trimmed = content.trim()
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  let jsonText = fenceMatch ? fenceMatch[1].trim() : trimmed

  // Some models wrap JSON in prose — try first object span.
  if (!jsonText.startsWith('{')) {
    const start = jsonText.indexOf('{')
    const end = jsonText.lastIndexOf('}')
    if (start >= 0 && end > start) {
      jsonText = jsonText.slice(start, end + 1)
    }
  }

  const parsed = JSON.parse(jsonText) as Record<string, unknown>

  const youtubeTitle = typeof parsed.youtubeTitle === 'string' ? parsed.youtubeTitle.trim() : ''
  const youtubeDescription =
    typeof parsed.youtubeDescription === 'string' ? parsed.youtubeDescription.trim() : ''
  const instagramCaption =
    typeof parsed.instagramCaption === 'string' ? parsed.instagramCaption.trim() : ''

  if (!youtubeTitle || !youtubeDescription || !instagramCaption) {
    throw new Error('AI response missing required fields')
  }

  return {
    youtubeTitle,
    youtubeDescription,
    instagramCaption,
    keywords: asStringArray(parsed.keywords),
    instagramHashtags: asStringArray(parsed.instagramHashtags),
    youtubeHashtags: asStringArray(parsed.youtubeHashtags),
  }
}

export function clampMetadataFields(parsed: ParsedMetadataFields): ParsedMetadataFields {
  return {
    youtubeTitle: parsed.youtubeTitle.substring(0, 100),
    youtubeDescription: parsed.youtubeDescription.substring(0, 5000),
    instagramCaption: parsed.instagramCaption.substring(0, 2200),
    keywords: parsed.keywords.slice(0, 25),
    instagramHashtags: parsed.instagramHashtags.slice(0, 20),
    youtubeHashtags: parsed.youtubeHashtags.slice(0, 12),
  }
}
