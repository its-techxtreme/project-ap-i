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

-- Seed default system settings
insert into public.system_settings (key, value)
values
  ('max_ffmpeg_concurrency',      '1'::jsonb),
  ('max_source_duration_seconds', '180'::jsonb),
  ('max_source_file_size_mb',     '500'::jsonb),
  ('verify_delay_minutes',        '30'::jsonb),
  ('job_lock_minutes',            '45'::jsonb)
on conflict (key) do nothing;
