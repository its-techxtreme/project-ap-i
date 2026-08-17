import { BACKGROUND_MUSIC_VOLUME } from '../processors/EditPreset'
import { config } from '../config'

/** Keys the Chart room surfaces (no secrets / paths). */
export const CHART_SETTING_KEYS = [
  'max_ffmpeg_concurrency',
  'max_download_concurrency',
  'max_source_duration_seconds',
  'max_source_file_size_mb',
  'verify_delay_minutes',
  'job_lock_minutes',
  'daily_upload_limit_per_account',
  'upload_stale_threshold_ms',
  'pipeline_stale_threshold_ms',
  'upload_platform_timeout_ms',
  'background_music_volume',
  'real_uploads_enabled',
  'youtube_uploads_enabled',
  'instagram_uploads_enabled',
  'collector_enabled',
  'collector_interval_ms',
] as const

export type ChartSettingKey = (typeof CHART_SETTING_KEYS)[number]

/**
 * Effective worker ops values for Chart room.
 * Sourced from env/config + edit preset — never includes secrets or filesystem paths.
 */
export function buildChartSettingsSnapshot(): Record<ChartSettingKey, number | boolean> {
  return {
    max_ffmpeg_concurrency: config.MAX_FFMPEG_CONCURRENCY,
    max_download_concurrency: config.MAX_DOWNLOAD_CONCURRENCY,
    max_source_duration_seconds: config.MAX_SOURCE_DURATION_SECONDS,
    max_source_file_size_mb: config.MAX_SOURCE_FILE_SIZE_MB,
    verify_delay_minutes: config.VERIFY_DELAY_MINUTES,
    job_lock_minutes: config.JOB_LOCK_MINUTES,
    daily_upload_limit_per_account: config.DAILY_UPLOAD_LIMIT_PER_ACCOUNT,
    upload_stale_threshold_ms: config.UPLOAD_STALE_THRESHOLD_MS,
    pipeline_stale_threshold_ms: config.PIPELINE_STALE_THRESHOLD_MS,
    upload_platform_timeout_ms: config.UPLOAD_PLATFORM_TIMEOUT_MS,
    background_music_volume: BACKGROUND_MUSIC_VOLUME,
    real_uploads_enabled: config.REAL_UPLOADS_ENABLED,
    youtube_uploads_enabled: config.YOUTUBE_UPLOADS_ENABLED,
    instagram_uploads_enabled: config.INSTAGRAM_UPLOADS_ENABLED,
    collector_enabled: config.COLLECTOR_ENABLED,
    collector_interval_ms: config.COLLECTOR_INTERVAL_MS,
  }
}
