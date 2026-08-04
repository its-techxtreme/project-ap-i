-- Sync Chart room system_settings with current MVP worker defaults.
-- Live laptop will overwrite these from env via worker heartbeat thereafter.

insert into public.system_settings (key, value, updated_at)
values
  ('max_ffmpeg_concurrency', '1'::jsonb, now()),
  ('max_download_concurrency', '2'::jsonb, now()),
  ('max_source_duration_seconds', '180'::jsonb, now()),
  ('max_source_file_size_mb', '500'::jsonb, now()),
  ('verify_delay_minutes', '5'::jsonb, now()),
  ('job_lock_minutes', '45'::jsonb, now()),
  ('daily_upload_limit_per_account', '5'::jsonb, now()),
  ('upload_stale_threshold_ms', '1500000'::jsonb, now()),
  ('pipeline_stale_threshold_ms', '3000000'::jsonb, now()),
  ('upload_platform_timeout_ms', '720000'::jsonb, now()),
  ('background_music_volume', '0.3'::jsonb, now()),
  ('real_uploads_enabled', 'true'::jsonb, now()),
  ('youtube_uploads_enabled', 'true'::jsonb, now()),
  ('instagram_uploads_enabled', 'true'::jsonb, now())
on conflict (key) do update
  set value = excluded.value,
      updated_at = excluded.updated_at;
