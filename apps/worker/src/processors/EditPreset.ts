import { config } from '../config'

/** Playback speed multiplier (video setpts + audio atempo). */
export const EDIT_SPEED = 1.2

/** Stronger eq than the old mild preset. sat +0.65 contrast +0.35. */
export const EDIT_VISUAL_FILTER = 'eq=saturation=1.75:contrast=1.4'

/** Background guitar bed under the original (sped) audio — 30% of source BGM level. */
export const BACKGROUND_MUSIC_VOLUME = 0.3

/** Final Shorts/Reels frame — required so YouTube treats the upload as a Short. */
export const OUTPUT_WIDTH = 1080
export const OUTPUT_HEIGHT = 1920

/** Cover-fit 9:16 then crop center. Landscape loses sides. setsar=1 for Studio. */
export const EDIT_VERTICAL_GEOMETRY = `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=increase,crop=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT},setsar=1`

export interface FfmpegPresetOptions {
  inputPath: string
  outputPath: string
  backgroundMusicPath?: string
  /** When false, output audio is BGM only (video had no soundtrack). */
  hasAudio?: boolean
}

/** Shared ffmpeg args. 1.2x, stronger filter, 1080x1920, orig audio + BGM 30%. Brand overlay is YT-only later so IG stays clean. */
export function buildFfmpegArgs(opts: FfmpegPresetOptions): string[] {
  const bgmPath = opts.backgroundMusicPath ?? config.BACKGROUND_MUSIC_PATH
  const hasAudio = opts.hasAudio ?? true

  const filters: string[] = [
    `[0:v]setpts=PTS/${EDIT_SPEED},${EDIT_VISUAL_FILTER},${EDIT_VERTICAL_GEOMETRY}[v_out]`,
  ]

  if (hasAudio) {
    filters.push(`[0:a]atempo=${EDIT_SPEED}[a_main]`)
    filters.push(`[1:a]volume=${BACKGROUND_MUSIC_VOLUME}[a_bg]`)
    // normalize=0 keeps the BGM bed from being re-leveled against the main track
    filters.push(
      `[a_main][a_bg]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a_out]`,
    )
  } else {
    filters.push(`[1:a]volume=${BACKGROUND_MUSIC_VOLUME}[a_out]`)
  }

  const args = [
    '-y',
    '-i',
    opts.inputPath,
    '-i',
    bgmPath,
    '-filter_complex',
    filters.join(';'),
    '-map',
    '[v_out]',
    '-map',
    '[a_out]',
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-crf',
    '23',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-shortest',
    '-movflags',
    '+faststart',
    opts.outputPath,
  ]

  return args
}
