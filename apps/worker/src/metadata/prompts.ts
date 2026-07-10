import type { MetadataInput } from './types'

const NICHE_CONTEXT: Record<string, string> = {
  memes: 'short humor, trending memes, and relatable clips',
  anime: 'anime edits, anime moments, and anime-related short clips',
  sports: 'sports highlights and commentary-style clips',
}

const NICHE_TAG_HINTS: Record<string, string> = {
  memes: '#memes #shorts #funny #reels',
  anime: '#anime #shorts #animeedit #reels',
  sports: '#sports #shorts #highlights #reels',
}

function truncateForPrompt(text: string, max = 1500): string {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= max) return cleaned
  return `${cleaned.slice(0, max)}…`
}

export function buildMetadataPrompt(input: MetadataInput): string {
  const context = NICHE_CONTEXT[input.nicheSlug] ?? 'short-form video content'
  const tagHint = NICHE_TAG_HINTS[input.nicheSlug] ?? '#shorts #reels'
  const hasSource =
    Boolean(input.sourceDescription?.trim()) || Boolean(input.sourceTitle?.trim())

  const sourceBlock = hasSource
    ? `Original source title: ${input.sourceTitle?.trim() ? truncateForPrompt(input.sourceTitle, 200) : '(none)'}
Original source caption/description:
${input.sourceDescription?.trim() ? truncateForPrompt(input.sourceDescription) : '(none — use title only)'}
${input.sourceChannel?.trim() ? `Original channel/uploader: ${truncateForPrompt(input.sourceChannel, 80)}` : ''}`
    : `Original source title: (not available)
Original source caption/description: (not available)
No original caption was extracted. Write niche-appropriate metadata for ${input.nicheSlug} only — do NOT invent a fake story about the video.`

  return `You rewrite social video metadata for a niche channel focused on ${context}.

Primary task: REPHRASE the original source caption/description (and title if useful). Keep the same topic and meaning. Do NOT invent an unrelated topic.

Produce:
1. YouTube title (max 70 characters) — rephrased from the source; engaging but not clickbait
2. YouTube description (2-3 sentences) — rephrased from the source, then end with 3-5 niche hashtags (examples: ${tagHint})
3. Instagram caption (1-2 sentences) — rephrased from the source in a conversational tone, then end with 3-5 niche hashtags

Source platform: ${input.sourcePlatform}
Niche: ${input.nicheSlug}

${sourceBlock}

Rules:
- Prefer the original caption/description as the meaning source; use the title only as backup
- Rephrase in fresh wording — do not copy the original verbatim
- Keep the same subject/joke/moment; do not invent unrelated plot, characters, or claims
- Strip or ignore @mentions, "follow me", promo CTAs, and external URLs from the source
- Do NOT include fake claims, misleading health/finance/legal advice, or spam language
- Do NOT reveal internal processing, job IDs, or pipeline details
- Do NOT include contact info or external links (hashtags only)
- Output ONLY valid JSON in this exact format:

{
  "youtubeTitle": "...",
  "youtubeDescription": "...",
  "instagramCaption": "..."
}`
}
