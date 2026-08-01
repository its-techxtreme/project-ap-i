import type { MetadataNicheSlug } from './types'
import type { ParsedMetadataFields } from './parseMetadataJson'

export class MetadataQualityError extends Error {
  constructor(
    message: string,
    readonly lengths: { title: number; description: number; caption: number },
  ) {
    super(message)
    this.name = 'MetadataQualityError'
  }
}

/** Length floors — quality over spam. Prefer unique paragraphs, not padded repeats. */
export function metadataLengthTargets(niche: MetadataNicheSlug): {
  minTitle: number
  maxTitle: number
  minDescription: number
  minCaption: number
} {
  return {
    minTitle: 40,
    maxTitle: 100,
    // Reach-friendly floor: long enough for SEO, short enough to avoid filler spam.
    minDescription: 750,
    minCaption: niche === 'memes' ? 220 : 420,
  }
}

/** Reject copy that talks about the pipeline / product instead of the reel. */
export function hasPipelineBoilerplate(text: string): boolean {
  const t = text.toLowerCase()
  const banned = [
    'publishing lane',
    'project ap-i',
    'project ap–i',
    'originally submitted as',
    'clip hook from the source',
    'metadata stays conservative',
    'we do not invent names, scores',
    'queued for the',
    'internal pipeline',
    'job id',
    'fallback metadata',
    'length checklist',
  ]
  return banned.some((b) => t.includes(b))
}

/** Reject copy that pads length by repeating the same sentence. */
export function hasSpammyRepetition(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length < 80) return false
  const sentences = normalized
    .split(/(?<=[.!?。！？])\s+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length >= 24)
  const counts = new Map<string, number>()
  for (const s of sentences) {
    counts.set(s, (counts.get(s) ?? 0) + 1)
    if ((counts.get(s) ?? 0) >= 3) return true
  }
  // Also catch naive space-joined repeats without punctuation
  const chunk = normalized.slice(0, 80).toLowerCase()
  if (chunk.length >= 40) {
    const occurrences = normalized.toLowerCase().split(chunk).length - 1
    if (occurrences >= 3) return true
  }
  return false
}

export function assertMetadataQuality(
  fields: ParsedMetadataFields,
  niche: MetadataNicheSlug,
): void {
  const targets = metadataLengthTargets(niche)
  const title = fields.youtubeTitle.trim().length
  const description = fields.youtubeDescription.trim().length
  const caption = fields.instagramCaption.trim().length

  const problems: string[] = []
  if (title < targets.minTitle) {
    problems.push(`youtubeTitle too short (${title} < ${targets.minTitle})`)
  }
  if (title > targets.maxTitle) {
    problems.push(`youtubeTitle too long (${title} > ${targets.maxTitle})`)
  }
  if (description < targets.minDescription) {
    problems.push(`youtubeDescription too short (${description} < ${targets.minDescription})`)
  }
  if (caption < targets.minCaption) {
    problems.push(`instagramCaption too short (${caption} < ${targets.minCaption})`)
  }
  if (hasSpammyRepetition(fields.youtubeDescription)) {
    problems.push('youtubeDescription looks like repeated filler spam')
  }
  if (hasSpammyRepetition(fields.instagramCaption)) {
    problems.push('instagramCaption looks like repeated filler spam')
  }
  if (hasPipelineBoilerplate(fields.youtubeDescription)) {
    problems.push('youtubeDescription contains pipeline/product boilerplate')
  }
  if (hasPipelineBoilerplate(fields.instagramCaption)) {
    problems.push('instagramCaption contains pipeline/product boilerplate')
  }
  if (hasPipelineBoilerplate(fields.youtubeTitle)) {
    problems.push('youtubeTitle contains pipeline/product boilerplate')
  }

  if (problems.length > 0) {
    throw new MetadataQualityError(problems.join('; '), { title, description, caption })
  }
}

export function buildLengthExpansionPrompt(
  previousJson: string,
  niche: MetadataNicheSlug,
): string {
  const targets = metadataLengthTargets(niche)
  return `Your previous JSON failed Project AP-I quality checks and cannot be used.

Previous JSON:
<<<UNTRUSTED_SOURCE_TEXT>>>
${previousJson.slice(0, 6000)}
<<<END_UNTRUSTED_SOURCE_TEXT>>>

Rewrite the FULL JSON object again with these HARD requirements:
- youtubeTitle: ${targets.minTitle}-${targets.maxTitle} characters (aim 45-85). Specific hook from the CLIP — not generic filler.
- youtubeDescription: ${targets.minDescription}-1800 characters about WHAT HAPPENS IN THE VIDEO. Multiple UNIQUE short paragraphs + CTA + 3-6 hashtags. NEVER repeat the same sentence to pad length.
- instagramCaption: at least ${targets.minCaption} characters (hook + short paragraphs + CTA + hashtags). No repeated filler lines.
- FORBIDDEN in any field: "publishing lane", "Project AP-I", "originally submitted", "clip hook from the source", "metadata stays conservative", pipeline/product talk.
- If source text looks unrelated to the niche (wrong language gossip, random @mentions), IGNORE it and write niche-appropriate copy from the niche + URL only.
- Keep accuracy rules: do not invent facts beyond the original context
- Return valid JSON only, same schema as before`
}
