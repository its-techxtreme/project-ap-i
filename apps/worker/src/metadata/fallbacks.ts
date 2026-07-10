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

const NICHE_TAGS: Record<string, string> = {
  memes: '#memes #shorts #funny #reels',
  anime: '#anime #shorts #animeedit #reels',
  sports: '#sports #shorts #highlights #reels',
}

function cleanSourceText(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Fallback metadata when AI is unavailable.
 * Prefer lightly cleaned original source caption/title + niche tags over generic templates.
 */
export function getFallbackMetadata(
  nicheSlug: string,
  source?: { title?: string; description?: string },
): MetadataOutput {
  const tags = NICHE_TAGS[nicheSlug] ?? '#shorts #reels'
  const raw = source?.description?.trim() || source?.title?.trim()
  const cleaned = raw ? cleanSourceText(raw) : ''

  if (cleaned.length >= 8) {
    const titleBase = cleaned.slice(0, 70)
    const body = cleaned.slice(0, 400)
    const captionBody = cleaned.slice(0, 300)
    return {
      youtubeTitle: titleBase,
      youtubeDescription: `${body}\n\n${tags}`,
      instagramCaption: `${captionBody} ${tags}`,
      generatedBy: 'fallback',
    }
  }

  return (
    FALLBACK_TEMPLATES[nicheSlug] ?? {
      youtubeTitle: 'Check out this short clip #shorts',
      youtubeDescription: 'New short video posted through Project AP-I. #shorts',
      instagramCaption: 'New update! #reels',
      generatedBy: 'fallback',
    }
  )
}
