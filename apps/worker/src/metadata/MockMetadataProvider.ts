import type { MetadataInput, MetadataOutput, MetadataProvider } from './types'

export class MockMetadataProvider implements MetadataProvider {
  async generate(input: MetadataInput): Promise<MetadataOutput> {
    const source = input.sourceDescription?.trim() || input.sourceTitle?.trim()
    if (source) {
      const short = source.replace(/\s+/g, ' ').slice(0, 60)
      const body = source.replace(/\s+/g, ' ').slice(0, 200)
      return {
        youtubeTitle: `[MOCK] ${short}`,
        youtubeDescription: `[MOCK] ${body} #${input.nicheSlug} #shorts`,
        instagramCaption: `[MOCK] ${body} #${input.nicheSlug} #reels`,
        generatedBy: 'ai',
        model: 'mock',
      }
    }

    return {
      youtubeTitle: `[MOCK] ${input.nicheSlug} video - test title`,
      youtubeDescription: `[MOCK] Description for ${input.nicheSlug} content. #${input.nicheSlug} #shorts`,
      instagramCaption: `[MOCK] Caption for ${input.nicheSlug}. #${input.nicheSlug} #reels`,
      generatedBy: 'ai',
      model: 'mock',
    }
  }
}
