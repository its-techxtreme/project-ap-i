export interface ParsedMetadataFields {
  youtubeTitle: string
  youtubeDescription: string
  instagramCaption: string
}

/** Parses model output that may be raw JSON or fenced in a markdown code block. */
export function parseMetadataJson(content: string): ParsedMetadataFields {
  const trimmed = content.trim()
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const jsonText = fenceMatch ? fenceMatch[1].trim() : trimmed

  const parsed = JSON.parse(jsonText) as Partial<ParsedMetadataFields>

  if (!parsed.youtubeTitle || !parsed.youtubeDescription || !parsed.instagramCaption) {
    throw new Error('AI response missing required fields')
  }

  return {
    youtubeTitle: parsed.youtubeTitle,
    youtubeDescription: parsed.youtubeDescription,
    instagramCaption: parsed.instagramCaption,
  }
}
