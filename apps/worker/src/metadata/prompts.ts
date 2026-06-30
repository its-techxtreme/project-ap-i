import type { MetadataInput } from './types'

export function buildMetadataPrompt(input: MetadataInput): string {
  const nicheContext: Record<string, string> = {
    memes: 'short humor, trending memes, and relatable clips',
    anime: 'anime edits, anime moments, and anime-related short clips',
    sports: 'sports highlights and commentary-style clips',
  }

  const context = nicheContext[input.nicheSlug] ?? 'short-form video content'

  return `You are a social media content writer for a niche channel focused on ${context}.

Generate the following for this video post:
1. YouTube title (max 70 characters, engaging, no clickbait or fake claims)
2. YouTube description (2-3 sentences, relevant to the niche, include 3-5 relevant hashtags at the end)
3. Instagram caption (1-2 sentences, conversational, with 3-5 relevant hashtags)

Source platform: ${input.sourcePlatform}
Niche: ${input.nicheSlug}
${input.sourceTitle ? `Original title reference: ${input.sourceTitle}` : ''}

Rules:
- Do NOT include fake claims, misleading health/finance/legal advice, or spam language
- Do NOT reveal internal processing, job IDs, or pipeline details
- Do NOT include contact info, external links (except approved hashtags)
- Keep content platform-appropriate and engaging
- Output ONLY valid JSON in this exact format:

{
  "youtubeTitle": "...",
  "youtubeDescription": "...",
  "instagramCaption": "..."
}`
}
