export interface MetadataInput {
  jobId: string
  sourceUrl: string
  sourcePlatform: 'youtube' | 'instagram'
  nicheSlug: 'memes' | 'anime' | 'sports'
  /** Original source title from yt-dlp when available. */
  sourceTitle?: string
  /** Original source caption/description from yt-dlp when available. */
  sourceDescription?: string
  sourceChannel?: string
}

export interface MetadataOutput {
  youtubeTitle: string
  youtubeDescription: string
  instagramCaption: string
  generatedBy: 'ai' | 'fallback'
  model?: string
}

export interface MetadataProvider {
  generate(input: MetadataInput): Promise<MetadataOutput>
}
