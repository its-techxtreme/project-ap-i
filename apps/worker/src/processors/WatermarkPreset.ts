import { config } from '../config'

export interface FfmpegPresetOptions {
  inputPath: string
  outputPath: string
  watermarkPath?: string
  /** When false, omit audio filters/maps (video-only sources). */
  hasAudio?: boolean
}

/**
 * Builds the FFmpeg argument array for the MVP processing preset:
 * - 1.1x video speed (setpts=PTS/1.1)
 * - 1.1x audio speed (atempo=1.1)
 * - Basic visual filter (eq=saturation=1.1:contrast=1.05)
 * - Bottom-right watermark at ~70% opacity
 * - Output: MP4/H.264/AAC
 */
export function buildFfmpegArgs(opts: FfmpegPresetOptions): string[] {
  const watermark = opts.watermarkPath ?? config.WATERMARK_PATH

  const videoFilter = [
    `[0:v]setpts=PTS/1.1,eq=saturation=1.1:contrast=1.05[v_sped]`,
    `[1:v]scale=80:-1,format=rgba,colorchannelmixer=aa=0.7[watermark]`,
    `[v_sped][watermark]overlay=W-w-10:H-h-10[v_out]`,
  ].join(';')

  const hasAudio = opts.hasAudio ?? true

  const args = [
    '-y',
    '-i', opts.inputPath,
    '-i', watermark,
    '-filter_complex', videoFilter,
    '-map', '[v_out]',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-movflags', '+faststart',
  ]

  if (hasAudio) {
    args.push('-af', 'atempo=1.1', '-map', '0:a?', '-c:a', 'aac', '-b:a', '128k')
  }

  args.push(opts.outputPath)
  return args
}
