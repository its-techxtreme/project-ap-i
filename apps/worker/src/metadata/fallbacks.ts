import type { MetadataOutput } from './types'

const FALLBACK_TEMPLATES: Record<string, MetadataOutput> = {
  memes: {
    youtubeTitle: 'This one had us laughing 😂 #shorts',
    youtubeDescription:
      'Check out this hilarious short clip! Drop a like if you relate. #memes #shorts #funny',
    instagramCaption: "Couldn't scroll past this one 😂 #memes #reels #funny",
    generatedBy: 'fallback',
  },
  anime: {
    youtubeTitle: 'Epic anime moment 🔥 #shorts #anime',
    youtubeDescription:
      'Amazing anime clip that hit different. Like and subscribe for more! #anime #shorts #animeedit',
    instagramCaption: 'When anime hits different 🔥 #anime #animereels #animeedit',
    generatedBy: 'fallback',
  },
  sports: {
    youtubeTitle: 'Incredible sports moment 🏆 #shorts',
    youtubeDescription: 'Watch this incredible moment in sports! #sports #shorts #highlight',
    instagramCaption: 'Moments like these remind us why we love sports 🏆 #sports #highlights #reels',
    generatedBy: 'fallback',
  },
}

export function getFallbackMetadata(nicheSlug: string): MetadataOutput {
  return (
    FALLBACK_TEMPLATES[nicheSlug] ?? {
      youtubeTitle: 'Check out this short clip #shorts',
      youtubeDescription: 'New short video posted through Project AP-I. #shorts',
      instagramCaption: 'New update! #reels',
      generatedBy: 'fallback',
    }
  )
}
