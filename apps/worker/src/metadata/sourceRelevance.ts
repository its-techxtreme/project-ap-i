import type { MetadataNicheSlug } from './types'

const NICHE_HINTS: Record<MetadataNicheSlug, RegExp> = {
  anime: /anime|manga|shonen|shoujo|waifu|senpai|otaku|naruto|one\s*piece|demon|jujutsu|bleach|edit/i,
  memes: /meme|funny|relatable|joke|lol|lmao|when\s+you|pov\b|protest|cbse|school|exam|fail/i,
  sports: /sport|goal|match|highlight|football|cricket|nba|soccer|tennis|athlete|win|score/i,
}

/** yt-dlp placeholder titles that carry no clip subject. */
export function isWeakSourceHook(text: string | undefined | null): boolean {
  const t = (text ?? '').replace(/\s+/g, ' ').trim()
  if (!t) return true
  if (/^video by [@\w.\-]+$/i.test(t)) return true
  if (/^reel by [@\w.\-]+$/i.test(t)) return true
  if (/^instagram reel$/i.test(t)) return true
  if (/^@[\w.\-]+$/i.test(t)) return true
  return false
}

/** Detect Instagram scrape noise / unrelated page copy that must not become the YT title. */
export function isJunkSourceText(text: string | undefined | null): boolean {
  const t = (text ?? '').replace(/\s+/g, ' ').trim()
  if (!t) return true
  if (t.length < 8) return true
  // Celebrity gossip / ad pages often land in IG og:description
  if ((t.match(/@\w+/g) ?? []).length >= 3) return true
  if (/gracieabrams|dojacat|bts\.bighit|ファッションショー|ハリウッドで行われ/i.test(t)) return true
  if (/今夜/.test(t) && /@/.test(t)) return true
  if (/subscribe|follow\s+for\s+more|link\s+in\s+bio|shop\s+now/i.test(t) && t.length < 80) return true
  // Mostly CJK without niche cues → usually wrong page language for our EN/Hinglish feeds
  const cjk = (t.match(/[\u3040-\u30ff\u3400-\u9fff]/g) ?? []).join('').length
  if (cjk > t.length * 0.45) return true
  return false
}

/**
 * Pull a short, searchable hook from a longer IG/YT caption.
 * Prefers the first substantial sentence / line over "Video by …".
 */
export function extractContentHook(
  title?: string,
  description?: string,
  maxLen = 90,
): string | undefined {
  const candidates: string[] = []
  for (const raw of [title, description]) {
    if (!raw?.trim()) continue
    if (isJunkSourceText(raw) || isWeakSourceHook(raw)) continue
    const lines = raw
      .split(/\n+/)
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter((l) => l.length >= 12)
    for (const line of lines) {
      if (isWeakSourceHook(line) || isJunkSourceText(line)) continue
      if (/^#\w+/.test(line)) continue
      if (/^credit:/i.test(line)) continue
      if (/fair comment|article 19|this is not defamation/i.test(line)) continue
      if (/^share this\b/i.test(line)) continue
      if (/^follow\b|^like\b|^comment\b/i.test(line) && line.length < 40) continue
      candidates.push(line)
    }
    // Also split long single-line captions into sentences
    if (lines.length <= 1 && raw.length > 120) {
      for (const sentence of raw.split(/(?<=[.!?])\s+/)) {
        const s = sentence.replace(/\s+/g, ' ').trim()
        if (
          s.length >= 20 &&
          !isWeakSourceHook(s) &&
          !isJunkSourceText(s) &&
          !/^share this\b/i.test(s)
        ) {
          candidates.push(s)
        }
      }
    }
  }

  const best = candidates.sort((a, b) => {
    // Prefer concrete subject length in the sweet spot for titles
    const score = (s: string) => {
      let n = 0
      if (s.length >= 28 && s.length <= 110) n += 3
      if (s.length >= 40) n += 1
      if (/[A-Z]{2,}|cbse|exam|student|protest|anime|goal|match|osm|minister|failed/i.test(s)) n += 4
      if (/share this|send this|tag a friend|follow for/i.test(s)) n -= 6
      if (isWeakSourceHook(s)) n -= 5
      return n
    }
    return score(b) - score(a)
  })[0]

  if (!best) return undefined
  if (best.length <= maxLen) return best.trim()
  const sliced = best.slice(0, maxLen)
  const at = Math.max(sliced.lastIndexOf(' '), sliced.lastIndexOf(','), sliced.lastIndexOf('—'))
  return (at >= Math.floor(maxLen * 0.45) ? sliced.slice(0, at) : sliced).trim()
}

/**
 * Keep source text that is plausible for this niche.
 * Long non-junk captions are kept — dropping them caused "Video by …" titles
 * while the real subject lived in the IG description.
 */
export function filterSourceForNiche(
  niche: MetadataNicheSlug | string,
  source?: { title?: string; description?: string },
): { title?: string; description?: string; usedSource: boolean; contentHook?: string } {
  const slug = (['memes', 'anime', 'sports'].includes(niche) ? niche : 'memes') as MetadataNicheSlug
  const hint = NICHE_HINTS[slug]

  const rawTitle = source?.title?.trim()
  const rawDesc = source?.description?.trim()

  const keepTitle =
    rawTitle && !isJunkSourceText(rawTitle) && !isWeakSourceHook(rawTitle) ? rawTitle : undefined
  // Keep substantive captions even without niche keywords (political meme, sports clip, etc.)
  const keepDesc =
    rawDesc && !isJunkSourceText(rawDesc) && rawDesc.length >= 12
      ? rawDesc.slice(0, 4000)
      : undefined

  const relevantTitle =
    keepTitle && (hint.test(keepTitle) || keepTitle.length <= 120) ? keepTitle : keepTitle
  const relevantDesc = keepDesc

  const contentHook = extractContentHook(relevantTitle, relevantDesc)

  return {
    title: relevantTitle,
    description: relevantDesc,
    contentHook,
    usedSource: Boolean(relevantTitle || relevantDesc || contentHook),
  }
}
