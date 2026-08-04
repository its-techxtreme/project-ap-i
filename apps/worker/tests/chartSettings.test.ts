import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/config', () => ({
  config: {
    NODE_ENV: 'test',
    MAX_FFMPEG_CONCURRENCY: 1,
    MAX_DOWNLOAD_CONCURRENCY: 2,
    MAX_SOURCE_DURATION_SECONDS: 180,
    MAX_SOURCE_FILE_SIZE_MB: 500,
    VERIFY_DELAY_MINUTES: 5,
    JOB_LOCK_MINUTES: 45,
    DAILY_UPLOAD_LIMIT_PER_ACCOUNT: 5,
    UPLOAD_STALE_THRESHOLD_MS: 1_500_000,
    PIPELINE_STALE_THRESHOLD_MS: 3_000_000,
    UPLOAD_PLATFORM_TIMEOUT_MS: 720_000,
    REAL_UPLOADS_ENABLED: true,
    YOUTUBE_UPLOADS_ENABLED: true,
    INSTAGRAM_UPLOADS_ENABLED: true,
  },
}))

vi.mock('../src/processors/EditPreset', () => ({
  BACKGROUND_MUSIC_VOLUME: 0.3,
}))

describe('buildChartSettingsSnapshot', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('exports effective worker ops without secrets', async () => {
    const { buildChartSettingsSnapshot, CHART_SETTING_KEYS } = await import(
      '../src/heartbeat/chartSettings'
    )
    const snap = buildChartSettingsSnapshot()

    expect(snap.verify_delay_minutes).toBe(5)
    expect(snap.background_music_volume).toBe(0.3)
    expect(snap.daily_upload_limit_per_account).toBe(5)
    expect(snap.real_uploads_enabled).toBe(true)
    expect(Object.keys(snap).sort()).toEqual([...CHART_SETTING_KEYS].sort())
    expect(JSON.stringify(snap)).not.toMatch(/SECRET|TOKEN|KEY|PASSWORD/i)
  })
})
