export interface MetadataInput {
  jobId: string
  sourceUrl: string
  sourcePlatform: 'youtube' | 'instagram'
  nicheSlug: 'memes' | 'anime' | 'sports'
  sourceTitle?: string
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
