import type { NicheSlug } from '@project-api/shared'

/**
 * Niche brand hard-caption (c-text) burned onto YouTube uploads only when the
 * source reel has no existing burned-in captions.
 */
export const YOUTUBE_BRAND_CTEXT: Record<NicheSlug, string> = {
  anime: 'ShonenSnaps',
  memes: 'CrackleCrumb',
  sports: 'ScoreMorsel',
}

/** Peak / trough opacity for the pulsing brand overlay. */
export const YT_CTEXT_OPACITY_HIGH = 0.6
export const YT_CTEXT_OPACITY_LOW = 0.2

/** Full pulse cycle: 5s near high → smooth to low → 5s near low → smooth to high. */
export const YT_CTEXT_PULSE_PERIOD_SECONDS = 10

/**
 * Cosine alpha expression: 0.4 + 0.2*cos(2πt/10)
 * → t=0: 0.6, t=5: 0.2, t=10: 0.6 with uniform smooth transitions.
 */
export function youtubeBrandAlphaExpression(): string {
  return `0.4+0.2*cos(2*PI*t/${YT_CTEXT_PULSE_PERIOD_SECONDS})`
}

export function youtubeBrandLabelForNiche(nicheSlug: string): string | undefined {
  if (nicheSlug in YOUTUBE_BRAND_CTEXT) {
    return YOUTUBE_BRAND_CTEXT[nicheSlug as NicheSlug]
  }
  return undefined
}

/** Escape a literal for FFmpeg drawtext `text=` (colons / quotes / backslashes). */
export function escapeDrawtextLiteral(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '%%')
}

export interface ContentCrop {
  w: number
  h: number
  x: number
  y: number
}

/**
 * Builds a drawtext filter that places niche brand c-text on the graphical
 * content area (using cropdetect bounds when available) with pulsing opacity.
 */
export function buildYoutubeBrandDrawtextFilter(opts: {
  label: string
  fontFile?: string
  contentCrop?: ContentCrop | null
}): string {
  const text = escapeDrawtextLiteral(opts.label)
  const alpha = youtubeBrandAlphaExpression()
  // Quote font paths so Windows drive-letter colons are not treated as option separators.
  const fontPart = opts.fontFile
    ? `fontfile='${escapeDrawtextLiteral(opts.fontFile.replace(/\\/g, '/'))}':`
    : ''

  // Center horizontally on content; vertically ~42% down the content box
  // so it sits on actual graphics rather than letterbox bars.
  let xExpr: string
  let yExpr: string
  let fontSizeExpr: string

  if (opts.contentCrop && opts.contentCrop.w > 0 && opts.contentCrop.h > 0) {
    const { w, h, x, y } = opts.contentCrop
    xExpr = `${x}+(${w}-text_w)/2`
    yExpr = `${y}+${h}*0.42`
    fontSizeExpr = `max(28\\,min(64\\,${h}*0.055))`
  } else {
    xExpr = '(w-text_w)/2'
    yExpr = 'h*0.42'
    fontSizeExpr = 'max(28\\,min(64\\,h*0.055))'
  }

  return (
    `drawtext=${fontPart}` +
    `text='${text}':` +
    `fontsize=${fontSizeExpr}:` +
    `fontcolor=white:` +
    `alpha='${alpha}':` +
    `borderw=2:` +
    `bordercolor=black@0.45:` +
    `x=${xExpr}:` +
    `y=${yExpr}`
  )
}
