import { describe, expect, it } from 'vitest'

import { EDIT_SPEED } from '../src/processors/EditPreset'
import {
  HARD_CAPTION_FRAME_SCORE_THRESHOLD,
  scoreCaptionBandGray,
} from '../src/processors/detectHardCaptions'
import {
  YOUTUBE_BRAND_CTEXT,
  buildYoutubeBrandDrawtextFilter,
  escapeDrawtextLiteral,
  youtubeBrandAlphaExpression,
  youtubeBrandLabelForNiche,
} from '../src/processors/youtubeBrandCText'
import { buildYoutubeBrandOverlayArgs } from '../src/processors/prepareYoutubeUploadVariant'

describe('EDIT_SPEED', () => {
  it('is 1.2x for the shared edit preset', () => {
    expect(EDIT_SPEED).toBe(1.2)
  })
})

describe('youtubeBrandCText', () => {
  it('maps niches to brand labels', () => {
    expect(YOUTUBE_BRAND_CTEXT.anime).toBe('ShonenSnaps')
    expect(YOUTUBE_BRAND_CTEXT.memes).toBe('CrackleCrumb')
    expect(YOUTUBE_BRAND_CTEXT.sports).toBe('ScoreMorsel')
    expect(youtubeBrandLabelForNiche('anime')).toBe('ShonenSnaps')
    expect(youtubeBrandLabelForNiche('unknown')).toBeUndefined()
  })

  it('uses a cosine alpha that oscillates 0.6 ↔ 0.2 over 10s', () => {
    const expr = youtubeBrandAlphaExpression()
    expect(expr).toBe('0.4+0.2*cos(2*PI*t/10)')
  })

  it('builds drawtext on content crop with pulsing alpha', () => {
    const filter = buildYoutubeBrandDrawtextFilter({
      label: 'ShonenSnaps',
      fontFile: 'C:/Windows/Fonts/arialbd.ttf',
      contentCrop: { w: 1080, h: 1400, x: 0, y: 260 },
    })

    expect(filter).toContain("text='ShonenSnaps'")
    expect(filter).toContain("alpha='0.4+0.2*cos(2*PI*t/10)'")
    expect(filter).toContain("fontfile='C\\:/Windows/Fonts/arialbd.ttf'")
    expect(filter).toContain('0+(1080-text_w)/2')
    expect(filter).toContain('260+1400*0.42')
    expect(filter).not.toContain('overlay=')
  })

  it('escapes drawtext special characters', () => {
    expect(escapeDrawtextLiteral(`a:b'c`)).toContain('\\:')
    expect(escapeDrawtextLiteral(`a:b'c`)).toContain("\\'")
  })
})

describe('buildYoutubeBrandOverlayArgs', () => {
  it('copies audio and applies drawtext video filter', () => {
    const args = buildYoutubeBrandOverlayArgs({
      inputPath: '/tmp/in.mp4',
      outputPath: '/tmp/out.mp4',
      label: 'CrackleCrumb',
      fontFile: 'C:/Windows/Fonts/arial.ttf',
    })

    expect(args).toContain('/tmp/in.mp4')
    expect(args).toContain('/tmp/out.mp4')
    expect(args).toContain('-vf')
    const vf = args[args.indexOf('-vf') + 1]
    expect(vf).toContain('CrackleCrumb')
    expect(vf).toContain("alpha='0.4+0.2*cos(2*PI*t/10)'")
    expect(args).toContain('-c:a')
    expect(args).toContain('copy')
  })
})

describe('scoreCaptionBandGray', () => {
  it('scores near-zero on a flat gray band', () => {
    const width = 64
    const height = 32
    const pixels = Buffer.alloc(width * height, 128)
    expect(scoreCaptionBandGray(pixels, width, height)).toBe(0)
  })

  it('scores high on a band with strong horizontal glyph-like edges', () => {
    const width = 64
    const height = 32
    const pixels = Buffer.alloc(width * height, 40)
    // Paint alternating high-contrast vertical strokes across mid rows (caption-like)
    for (let y = 8; y < 24; y++) {
      for (let x = 0; x < width; x++) {
        pixels[y * width + x] = x % 3 === 0 ? 240 : 20
      }
    }
    const score = scoreCaptionBandGray(pixels, width, height)
    expect(score).toBeGreaterThanOrEqual(HARD_CAPTION_FRAME_SCORE_THRESHOLD)
  })
})
