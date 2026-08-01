import { config } from '../config'

/** Playback speed multiplier (video setpts + audio atempo). */
export const EDIT_SPEED = 1.2

/**
 * Visual eq strength vs the old mild preset (saturation=1.1, contrast=1.05).
 * Deltas are ~7.5×: sat +0.65, contrast +0.35.
 */
export const EDIT_VISUAL_FILTER = 'eq=saturation=1.75:contrast=1.4'

/** Background bed under the original (sped) audio — keep very quiet. */
export const BACKGROUND_MUSIC_VOLUME = 0.05

/** Final Shorts/Reels frame — required so YouTube treats the upload as a Short. */
export const OUTPUT_WIDTH = 1080
export const OUTPUT_HEIGHT = 1920

/**
 * Cover-fit to 9:16 then center-crop. Landscape sources lose side margins;
 * already-vertical reels stay full-bleed. setsar=1 keeps square pixels for Studio.
 */
export const EDIT_VERTICAL_GEOMETRY = `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=increase,crop=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT},setsar=1`

export interface FfmpegPresetOptions {
  inputPath: string
  outputPath: string
  backgroundMusicPath?: string
  /** When false, output audio is BGM only (video had no soundtrack). */
  hasAudio?: boolean
}

/**
 * Builds the FFmpeg argument array for the current processing preset:
 * - 1.2x video + audio speed
 * - stronger visual eq (no Instagram watermark / brand overlay)
 * - force 1080x1920 vertical (YouTube Shorts / Instagram Reels)
 * - original audio kept + background music mixed at 5% volume
 * - Output: MP4/H.264/AAC
 *
 * YouTube-only niche brand c-text (when source has no hard captions) is applied
 * later in the upload path — not here — so Instagram keeps the clean export.
 */
export function buildFfmpegArgs(opts: FfmpegPresetOptions): string[] {
  const bgmPath = opts.backgroundMusicPath ?? config.BACKGROUND_MUSIC_PATH
  const hasAudio = opts.hasAudio ?? true

  const filters: string[] = [
    `[0:v]setpts=PTS/${EDIT_SPEED},${EDIT_VISUAL_FILTER},${EDIT_VERTICAL_GEOMETRY}[v_out]`,
  ]

  if (hasAudio) {
    filters.push(`[0:a]atempo=${EDIT_SPEED}[a_main]`)
    filters.push(`[1:a]volume=${BACKGROUND_MUSIC_VOLUME}[a_bg]`)
    // normalize=0 keeps the 5% bed from being re-leveled against the main track
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
