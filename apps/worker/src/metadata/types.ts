export type MetadataNicheSlug = 'memes' | 'anime' | 'sports'
export type MetadataAiProvider = 'gemini' | 'groq' | 'openrouter' | 'fallback'

export interface MetadataInput {
  jobId: string
  sourceUrl: string
  sourcePlatform: 'youtube' | 'instagram'
  nicheSlug: MetadataNicheSlug
  /** Original source title from yt-dlp when available. */
  sourceTitle?: string
  /** Original source caption/description from yt-dlp when available. */
  sourceDescription?: string
  sourceChannel?: string
  /** Spoken / transcript text when available (highest-trust context). */
  transcript?: string
  /** Optional admin / creator notes for this job. */
  creatorNotes?: string
  /** Target niche account display name when known. */
  accountName?: string
  /** Optional style notes for the target account. */
  accountStyle?: string
}

export interface MetadataOutput {
  youtubeTitle: string
  youtubeDescription: string
  instagramCaption: string
  keywords?: string[]
  instagramHashtags?: string[]
  youtubeHashtags?: string[]
  generatedBy: 'ai' | 'fallback'
  model?: string
  provider?: MetadataAiProvider
}

export interface MetadataProvider {
  generate(input: MetadataInput): Promise<MetadataOutput>
}
