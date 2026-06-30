import type { MetadataInput, MetadataOutput, MetadataProvider } from './types'

export class MockMetadataProvider implements MetadataProvider {
  async generate(input: MetadataInput): Promise<MetadataOutput> {
    return {
      youtubeTitle: `[MOCK] ${input.nicheSlug} video - test title`,
      youtubeDescription: `[MOCK] Description for ${input.nicheSlug} content. #${input.nicheSlug} #shorts`,
      instagramCaption: `[MOCK] Caption for ${input.nicheSlug}. #${input.nicheSlug} #reels`,
      generatedBy: 'ai',
      model: 'mock',
    }
  }
}
