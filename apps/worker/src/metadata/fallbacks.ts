import type { MetadataNicheSlug } from './types'
import type { MetadataOutput } from './types'
import { metadataLengthTargets } from './quality'
import { extractContentHook, filterSourceForNiche, isWeakSourceHook } from './sourceRelevance'

const NICHE_TAGS: Record<MetadataNicheSlug, string> = {
  memes: '#memes #shorts #funny #reels #relatable #dankmemes',
  anime: '#anime #shorts #animeedit #reels #animemoments #animeshorts',
  sports: '#sports #shorts #highlights #reels #sportsmoments #sportsshorts',
}

const NICHE_TITLE_FALLBACK: Record<MetadataNicheSlug, string[]> = {
  memes: [
    'When the joke hits harder than expected',
    'That meme timing you were not ready for',
    'POV: the timeline reads your mind again',
    'A relatable short that pauses the scroll',
  ],
  anime: [
    'That anime moment that freezes the frame',
    'Anime edit energy you feel in one cut',
    'When the anime beat hits different',
    'A clean anime short for late-night scrolling',
  ],
  sports: [
    'A sports highlight built on pure timing',
    'That sports moment you replay once',
    'Skill, reaction, and a finish worth watching',
    'A clean sports short for highlight hunters',
  ],
}

function cleanSourceText(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function pick(list: string[], salt: number): string {
  return list[Math.abs(salt) % list.length]
}

function hashSalt(input: string): number {
  let h = 0
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) | 0
  return Math.abs(h)
}

function uniqueJoin(parts: string[]): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of parts) {
    const key = p.replace(/\s+/g, ' ').trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(p.trim())
  }
  return out.join('\n\n')
}

function firstSentences(text: string, maxChars: number): string {
  const cleaned = cleanSourceText(
    text
      .split(/\n+/)
      .map((l) => l.trim())
      .filter((l) => l && !/^share this\b/i.test(l) && !/^#\w+/.test(l))
      .join(' '),
  )
  if (cleaned.length <= maxChars) return cleaned
  const parts = cleaned.split(/(?<=[.!?])\s+/)
  let out = ''
  for (const p of parts) {
    const next = out ? `${out} ${p}` : p
    if (next.length > maxChars) break
    out = next
  }
  return (out || cleaned.slice(0, maxChars)).trim()
}

function clipTitle(text: string, max = 90): string {
  const t = text.trim()
  if (t.length <= max) return t
  const sliced = t.slice(0, max)
  const at = Math.max(sliced.lastIndexOf(' '), sliced.lastIndexOf('—'), sliced.lastIndexOf('-'))
  if (at >= 40) return sliced.slice(0, at).trim()
  return sliced.trim()
}

function buildTitle(niche: MetadataNicheSlug, hook: string | undefined, salt: number): string {
  const base = pick(NICHE_TITLE_FALLBACK[niche], salt)
  if (!hook || isWeakSourceHook(hook)) return clipTitle(base)
  const h = cleanSourceText(hook)
  if (h.length >= 40 && h.length <= 90) return h
  if (h.length >= 18 && h.length < 40) {
    return clipTitle(`${h} | ${base}`)
  }
  return clipTitle(h)
}

/**
 * Expand a real caption into YouTube-length copy about the CLIP — never about
 * the publishing pipeline, metadata policy, or "Project AP-I".
 */
function buildDescriptionFromSource(
  niche: MetadataNicheSlug,
  hook: string | undefined,
  description: string | undefined,
  salt: number,
  tags: string,
): string {
  const targets = metadataLengthTargets(niche)
  const subject = hook ? cleanSourceText(hook) : undefined
  const body = description ? firstSentences(description, 900) : undefined

  const open =
    subject && body && !body.toLowerCase().startsWith(subject.toLowerCase().slice(0, 24))
      ? `${subject}`
      : subject
        ? subject
        : pick(
            [
              `A ${niche} Short built around a clear punchline and a fast payoff.`,
              `This ${niche} clip is paced for mobile — hook first, then the beat that makes you rewind.`,
            ],
            salt,
          )

  const explain =
    body && body.length >= 40
      ? body
      : subject
        ? `What you are watching: ${subject}. The Short keeps the focus on that moment — timing, reaction, and the detail that sells the joke or the beat.`
        : `What you are watching is a ${niche} Short: a quick visual hook, a clear beat, and a finish that still works on a second watch.`

  const vibe = pick(
    niche === 'memes'
      ? [
          'The humor lands because the setup is recognizable and the punch arrives before you overthink it.',
          'It is the kind of clip you send to a friend mid-scroll because the timing feels too accurate.',
        ]
      : niche === 'anime'
        ? [
            'The energy is visual first — expression, cut pacing, and atmosphere — not a forced plot dump.',
            'If you know the series you will feel the recognition hit; if not, the edit still reads as a standalone mood clip.',
          ]
        : [
            'The highlight is the visible skill and reaction — what is on camera, not invented stats or spoilers.',
            'Highlight pacing keeps the pressure clear from the first second through the finish.',
          ],
    salt + 2,
  )

  const search = pick(
    niche === 'memes'
      ? [
          'Search angles: funny shorts, relatable memes, scroll-stopping reactions, everyday chaos.',
          'Built for meme-page viewers who want a fast laugh without a lecture.',
        ]
      : niche === 'anime'
        ? [
            'Search angles: anime shorts, anime edits, anime moments, anime reels.',
            'Written for fans who stop for a strong visual hook on anime Shorts pages.',
          ]
        : [
            'Search angles: sports highlights, sports shorts, clutch moments, skill clips.',
            'For fans who scroll highlight pages and stop for clean execution.',
          ],
    salt + 4,
  )

  const cta = pick(
    niche === 'memes'
      ? [
          'Which line hit first for you — drop it in the comments.',
          'If this felt too accurate, send it to the friend who lives this bit.',
        ]
      : niche === 'anime'
        ? [
            'Know the series? Drop the name in the comments — no spoilers needed.',
            'Was it the animation, the music cue, or the expression that hit hardest?',
          ]
        : [
            'What stood out first — the skill, the reaction, or the build-up?',
            'Rate the moment 1–10 in the comments.',
          ],
    salt + 7,
  )

  const extras = [
    subject
      ? `Rewatch once for the punchline and again for the small reaction details that make “${subject.slice(0, 72)}” stick.`
      : `Rewatch once for the punchline and again for the small reaction details that make the clip stick.`,
    `Keep watching to the end — the last beat is part of why this Short holds up on a second play.`,
    niche === 'memes'
      ? `If you collect chaotic timeline humor, this one belongs in that stack.`
      : niche === 'anime'
        ? `Save it if you collect sharp anime moments for late-night scrolling.`
        : `Save it if you collect clean sports moments worth a quick replay.`,
  ]

  let out = uniqueJoin([open, explain, vibe, search, cta, ...extras, tags])

  let ei = 0
  while (out.length < targets.minDescription && ei < extras.length) {
    out = uniqueJoin([
      out,
      `More on the moment: the Short stays with what the clip shows — no invented backstory, just the beat you came for.`,
    ])
    ei += 1
    if (ei > 6) break
  }
  while (out.length < targets.minDescription) {
    out = uniqueJoin([
      out,
      subject
        ? `Context in one line: ${subject}. That is the core of this Short.`
        : `Context in one line: a ${niche} Short designed for a fast stop-scroll and a clear finish.`,
    ])
    if (out.length > targets.minDescription + 180) break
  }

  return out.slice(0, 5000)
}

function buildCaption(
  niche: MetadataNicheSlug,
  hook: string | undefined,
  description: string | undefined,
  salt: number,
  tags: string,
): string {
  const targets = metadataLengthTargets(niche)
  const subject = hook ? cleanSourceText(hook).slice(0, 160) : pick(NICHE_TITLE_FALLBACK[niche], salt + 11)
  const snippet = description ? firstSentences(description, 280) : undefined
  const cta = pick(
    [
      'Which part hit first — drop it below.',
      'Send this to someone who needed it today.',
      'Thoughts? Comment without spoiling the whole bit.',
    ],
    salt + 9,
  )

  let caption = uniqueJoin([
    subject,
    snippet && snippet.toLowerCase() !== subject.toLowerCase() ? snippet : '',
    cta,
    tags,
  ])

  const captionExpanders = [
    snippet
      ? `The clip keeps the focus on that beat — short, clear, and made for a quick rewatch.`
      : `A ${niche} clip with a fast hook and a finish that still works on replay.`,
    `Mobile pacing matters: the first second should make the subject obvious.`,
    niche === 'anime'
      ? `If the series hits, drop the name without spoiling the arc.`
      : niche === 'sports'
        ? `Call the moment in the comments — skill, reaction, or finish.`
        : `Tag someone who would feel called out by this one.`,
    `Stay for the last beat — that is usually where the Short earns the rewatch.`,
    niche === 'anime'
      ? `Mood, motion, and timing over a forced plot summary.`
      : niche === 'sports'
        ? `No invented scores — just the moment you can see on camera.`
        : `Punchy humor without over-explaining the joke.`,
  ]
  let ci = 0
  while (caption.length < targets.minCaption && ci < captionExpanders.length) {
    caption = uniqueJoin([caption, captionExpanders[ci]])
    ci += 1
  }
  // Last-resort unique pads (still about the clip, never pipeline talk)
  let pad = 0
  while (caption.length < targets.minCaption && pad < 4) {
    caption = uniqueJoin([
      caption,
      `Extra beat ${pad + 1}: this ${niche} Short is meant to stop the scroll and invite a real reaction in the comments.`,
    ])
    pad += 1
  }
  return caption.slice(0, 2200)
}

/**
 * High-quality fallback when AI is down — copy about the reel/clip, never about
 * the internal publishing system.
 */
export function getFallbackMetadata(
  nicheSlug: string,
  source?: { title?: string; description?: string; sourceUrl?: string; sourcePlatform?: string },
): MetadataOutput {
  const niche = (['memes', 'anime', 'sports'].includes(nicheSlug) ? nicheSlug : 'memes') as MetadataNicheSlug
  const targets = metadataLengthTargets(niche)
  const tags = NICHE_TAGS[niche]
  const filtered = filterSourceForNiche(niche, source)
  const salt = hashSalt(
    `${niche}|${source?.sourceUrl ?? ''}|${filtered.contentHook ?? ''}|${filtered.description?.slice(0, 80) ?? ''}`,
  )

  const hook =
    filtered.contentHook ??
    extractContentHook(filtered.title, filtered.description) ??
    (filtered.title && !isWeakSourceHook(filtered.title) ? filtered.title : undefined)

  let title = buildTitle(niche, hook, salt)
  if (title.length < targets.minTitle) {
    title = `${title} — ${niche} shorts`.slice(0, targets.maxTitle)
  }
  title = title.slice(0, targets.maxTitle)

  const youtubeDescription = buildDescriptionFromSource(
    niche,
    hook,
    filtered.description,
    salt,
    tags,
  )
  const instagramCaption = buildCaption(niche, hook, filtered.description, salt, tags)

  return {
    youtubeTitle: title,
    youtubeDescription,
    instagramCaption,
    generatedBy: 'fallback',
  }
}
