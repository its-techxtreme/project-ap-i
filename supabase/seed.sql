-- Project AP-I — Seed Data
-- Run this after all migrations to populate initial data.

-- Seed the three finalized niches
insert into public.niches (slug, name, is_active)
values
  ('memes',  'Memes',  true),
  ('anime',  'Anime',  true),
  ('sports', 'Sports', true)
on conflict (slug) do update
  set name      = excluded.name,
      is_active = excluded.is_active,
      updated_at = now();

-- Seed default system settings (Chart room). Worker heartbeat overwrites with live env.
insert into public.system_settings (key, value)
values
  ('max_ffmpeg_concurrency',         '1'::jsonb),
  ('max_download_concurrency',       '2'::jsonb),
  ('max_source_duration_seconds',    '180'::jsonb),
  ('max_source_file_size_mb',        '500'::jsonb),
  ('verify_delay_minutes',           '5'::jsonb),
  ('job_lock_minutes',               '45'::jsonb),
  ('daily_upload_limit_per_account', '5'::jsonb),
  ('upload_stale_threshold_ms',      '1500000'::jsonb),
  ('pipeline_stale_threshold_ms',    '3000000'::jsonb),
  ('upload_platform_timeout_ms',     '720000'::jsonb),
  ('background_music_volume',        '0.3'::jsonb),
  ('real_uploads_enabled',           'false'::jsonb),
  ('youtube_uploads_enabled',        'false'::jsonb),
  ('instagram_uploads_enabled',      'false'::jsonb)
on conflict (key) do nothing;
