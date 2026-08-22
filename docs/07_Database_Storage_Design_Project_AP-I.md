---
subtitle: "Database and Storage Design"
author: "Atharva (Techno)"
date: "2026-06-29"
geometry: margin=0.72in
fontsize: 10pt
mainfont: DejaVu Sans
monofont: DejaVu Sans Mono
colorlinks: true
linkcolor: blue
urlcolor: blue
toc: true
numbersections: true
---

# Database and Storage Design

## Document control

| Field | Value |
|---|---|
| Project name | Project AP-I |
| Developer | Atharva (Techno) |
| Document | Database and Storage Design |
| Version | 1.1 |
| Database | Supabase Postgres |
| File staging | Google Drive |

## Data design principle

Supabase stores truth. Google Drive stores files. Do not infer job status from Drive folders.

Every important operation must result in a database state change or audit event.

## Entity overview

```text
profiles
  -> users and roles

niches
  -> selectable content categories

platform_accounts
  -> one YouTube and one Instagram account per niche

jobs
  -> submitted content job and processing state

upload_attempts
  -> each attempt to upload a job to a platform

job_events
  -> technical timeline of job processing

audit_logs
  -> user/admin/security-relevant actions

system_settings
  -> configurable system-level values
```

## Table: profiles

Purpose: store app-specific user metadata linked to Supabase Auth users.

Columns:

```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'submitter' check (role in ('submitter', 'admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

## Table: niches

Purpose: store selectable niches.

```sql
create table public.niches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Rules:

- Submit form loads only active niches.
- Each active niche must have one active YouTube account and one active Instagram account.

## Table: platform_accounts

Purpose: store target account mapping and session health metadata.

```sql
create table public.platform_accounts (
  id uuid primary key default gen_random_uuid(),
  niche_id uuid not null references public.niches(id) on delete cascade,
  platform text not null check (platform in ('youtube', 'instagram')),
  account_label text not null,
  username_hint text,  -- public @handle for Sea lanes live profile cards (required for accurate links)
  browser_profile_path text,
  status text not null default 'active' check (status in ('active', 'paused', 'login_required', 'failing', 'disabled')),
  login_required boolean not null default false,
  failure_count integer not null default 0,
  last_successful_upload_at timestamptz,
  last_session_check_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(niche_id, platform)
);
```

Do not store raw passwords in this table.

## Table: jobs

Purpose: main job record.

```sql
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  public_job_code text unique,
  submitted_by uuid references public.profiles(id),
  source_url text not null,
  normalized_source_url text,
  source_platform text not null check (source_platform in ('youtube', 'instagram')),
  niche_id uuid not null references public.niches(id),
  rights_confirmed boolean not null default false,

  status text not null default 'queued',
  download_status text not null default 'pending',
  processing_status text not null default 'pending',
  metadata_status text not null default 'pending',
  youtube_upload_status text not null default 'pending',
  instagram_upload_status text not null default 'pending',
  verification_status text not null default 'pending',

  target_youtube_account_id uuid references public.platform_accounts(id),
  target_instagram_account_id uuid references public.platform_accounts(id),

  drive_file_id text,
  drive_file_name text,
  drive_view_url text,
  drive_folder_state text,
  drive_deleted_at timestamptz,

  youtube_title text,
  youtube_description text,
  instagram_caption text,

  retry_count integer not null default 0,
  youtube_retry_count integer not null default 0,
  instagram_retry_count integer not null default 0,
  failure_code text,
  failure_reason text,

  locked_by text,
  locked_at timestamptz,
  lock_expires_at timestamptz,
  verification_due_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz,
  uploaded_at timestamptz,
  completed_at timestamptz
);
```

Recommended `status` values:

```text
queued
locked
validating
downloading
downloaded
processing
processed
staging_to_drive
ready_to_upload
uploading
awaiting_verification
completed
failed
needs_manual_review
ignored
```

## Table: upload_attempts

Purpose: record each platform upload attempt.

```sql
create table public.upload_attempts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  platform text not null check (platform in ('youtube', 'instagram')),
  platform_account_id uuid references public.platform_accounts(id),
  attempt_number integer not null,
  status text not null default 'started',
  platform_media_id text,
  platform_url text,
  error_code text,
  error_message text,
  login_required boolean not null default false,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
```

Status values:

```text
started
uploaded
verified
failed
login_required
uncertain
```

## Table: job_events

Purpose: technical event timeline.

```sql
create table public.job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete cascade,
  stage text,
  event_type text not null,
  severity text not null default 'info' check (severity in ('debug', 'info', 'warning', 'error')),
  message text,
  metadata jsonb,
  created_at timestamptz not null default now()
);
```

## Table: audit_logs

Purpose: security and admin/user action audit.

```sql
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id),
  actor_type text not null check (actor_type in ('user', 'admin', 'worker', 'system')),
  action text not null,
  target_type text,
  target_id uuid,
  ip_address text,
  user_agent text,
  metadata jsonb,
  created_at timestamptz not null default now()
);
```

Audit actions:

```text
job_created
manual_retry_requested
drive_delete_requested
drive_deleted
job_marked_ignored
niche_created
niche_updated
account_updated
login_recovered_marked
admin_login
```

## Table: admin_commands

Purpose: outbox for hosted-admin actions that must run on the local worker (retry upload, Drive delete).

```sql
create table public.admin_commands (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  command text not null check (command in ('retry_upload', 'delete_drive_file')),
  status text not null default 'pending'
    check (status in ('pending', 'claimed', 'done', 'failed')),
  requested_by uuid references public.profiles(id),
  payload jsonb not null default '{}'::jsonb,
  error text,
  claimed_by text,
  claimed_at timestamptz,
  lock_expires_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Flow:

1. Admin UI (Vercel) validates job state and inserts `status=pending`.
2. Local n8n WF-07 calls worker `POST /admin-commands/process-next`.
3. Worker claims via `claim_next_admin_command` (FOR UPDATE SKIP LOCKED) and executes.
4. Command marked `done` or `failed`; job events + existing worker audit paths apply.

## Table: collector_inbox_items

Purpose: Instagram collector DMs that are not yet jobs, or a record of collector ingest.

```sql
create table public.collector_inbox_items (
  id uuid primary key default gen_random_uuid(),
  normalized_source_url text not null unique,
  source_url text not null,
  sender_username text,
  thread_id text,
  niche_slug text check (niche_slug is null or niche_slug in ('memes', 'anime', 'sports')),
  status text not null default 'pending_niche'
    check (status in ('pending_niche', 'queued', 'duplicate', 'invalid')),
  job_id uuid references public.jobs(id) on delete set null,
  skip_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

RLS: admin-only. `pending_niche` rows wait for Unsorted cargo confirm before `jobs` insert (`niche_id` remains required on jobs). Admin reject sets `status=invalid` and `skip_reason=admin_rejected`.

## Table: system_settings

Purpose: lightweight key-value settings.

```sql
create table public.system_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
```

Example settings:

```json
{
  "max_ffmpeg_concurrency": 1,
  "max_download_concurrency": 2,
  "max_source_duration_seconds": 180,
  "max_source_file_size_mb": 500,
  "verify_delay_minutes": 5,
  "job_lock_minutes": 45,
  "daily_upload_limit_per_account": 5,
  "upload_stale_threshold_ms": 1500000,
  "pipeline_stale_threshold_ms": 3000000,
  "upload_platform_timeout_ms": 720000,
  "background_music_volume": 0.3,
  "real_uploads_enabled": false,
  "youtube_uploads_enabled": false,
  "instagram_uploads_enabled": false,
  "collector_enabled": false,
  "collector_interval_ms": 10800000
}
```

Chart room (`/admin/settings`) displays these keys. When the native worker is online, heartbeat upserts the **effective** env/config values (including `VERIFY_DELAY_MINUTES` and BGM volume) so the dashboard stays current. `worker_heartbeat` is a separate presence blob and is not listed as a setting row.

## Indexes

Recommended:

```sql
create index idx_jobs_status_created_at on public.jobs(status, created_at);
create index idx_jobs_niche_id on public.jobs(niche_id);
create index idx_jobs_submitted_by on public.jobs(submitted_by);
create index idx_jobs_verification_due on public.jobs(status, verification_due_at);
create index idx_upload_attempts_job_platform on public.upload_attempts(job_id, platform);
create index idx_job_events_job_created on public.job_events(job_id, created_at);
create index idx_audit_logs_created on public.audit_logs(created_at);
```

## Atomic job claiming function

Recommended RPC:

```sql
create or replace function public.claim_next_job(worker_id text, lock_minutes integer default 45)
returns public.jobs
language plpgsql
security definer
as $$
declare
  claimed public.jobs;
begin
  select * into claimed
  from public.jobs
  where status = 'queued'
    and rights_confirmed = true
  order by created_at asc
  for update skip locked
  limit 1;

  if claimed.id is null then
    return null;
  end if;

  update public.jobs
  set status = 'locked',
      locked_by = worker_id,
      locked_at = now(),
      lock_expires_at = now() + make_interval(mins => lock_minutes),
      updated_at = now()
  where id = claimed.id
  returning * into claimed;

  return claimed;
end;
$$;
```

## RLS policy overview

Enable RLS on all public tables.

High-level rules:

```text
profiles:
  users can read/update limited own profile
  admins can read all

niches:
  authenticated users can read active niches
  admins can manage

platform_accounts:
  submitters cannot read sensitive fields
  admins can read/manage

jobs:
  submitters can insert jobs for themselves
  submitters can read own jobs only if enabled
  admins can read/manage all
  worker uses service role only

upload_attempts/job_events:
  admins can read
  submitters optional limited read for own jobs

audit_logs:
  admins can read
  users cannot directly insert except through server actions
```

## Google Drive file model

Drive folder structure:

```text
/ReelBot
  /processed_ready
  /failed_manual_review
```

Drive file state is tracked in jobs:

```text
drive_file_id
drive_file_name
drive_view_url
drive_folder_state
```

Possible folder states:

```text
processed_ready
failed_manual_review
deleted
unknown
```

## Drive cleanup state rules

```text
If both uploads verified:
  delete Drive file
  set drive_deleted_at
  set drive_folder_state = deleted

If one or both uploads fail twice:
  keep Drive file
  move or mark folder_state = failed_manual_review

If admin deletes failed file:
  delete Drive file
  keep job record
  write audit log
```

## Data retention

Recommended MVP retention:

```text
jobs: keep indefinitely
job_events: keep 90 days or indefinitely at low volume
upload_attempts: keep indefinitely
audit_logs: keep indefinitely
Drive processed files: delete on success
Drive failed files: manual cleanup
local temp files: delete immediately after processing or failure
```

## Backup recommendations

- Export Supabase schema after initial setup.
- Keep migration files in Git.
- Enable regular local backups of `.env` and n8n exports.
- Do not rely on local disk as the only Supabase backup (use Supabase backups).
- Periodically export important Supabase tables if this becomes business-critical.

## Database acceptance checklist

- All tables created.
- RLS enabled.
- Admin policies tested.
- Submitter insert tested.
- Submitter cannot read other users' jobs.
- Service role works only server-side.
- Job claim function prevents duplicate processing.
- Upload attempts record both platforms.
- Failed file deletion keeps job history.
- Audit logs are written for manual admin actions.

## Finalized seed data - Version 1.1

The `niches` table must be seeded with exactly these MVP rows:

```sql
insert into public.niches (slug, name, is_active)
values
  ('memes', 'Memes', true),
  ('anime', 'Anime', true),
  ('sports', 'Sports', true)
on conflict (slug) do update
set name = excluded.name,
    is_active = excluded.is_active;
```

Each niche must have exactly two active `platform_accounts` rows:

```text
memes  -> one youtube account, one instagram account
anime  -> one youtube account, one instagram account
sports -> one youtube account, one instagram account
```

Recommended database guardrail:

```sql
create unique index if not exists uniq_active_platform_account_per_niche
on public.platform_accounts (niche_id, platform)
where is_active = true;
```

This prevents accidentally configuring two active YouTube accounts for the same niche.

# References

- YouTube Data API video resources and upload behavior: <https://developers.google.com/youtube/v3/docs/videos>
- YouTube Data API upload guide: <https://developers.google.com/youtube/v3/guides/uploading_a_video>
- Instagram Platform content publishing documentation: <https://developers.facebook.com/docs/instagram-platform/content-publishing/>
- Supabase Row Level Security documentation: <https://supabase.com/docs/guides/database/postgres/row-level-security>
- Supabase API keys and service role key guidance: <https://supabase.com/docs/guides/getting-started/api-keys>
- Supabase secure data guidance: <https://supabase.com/docs/guides/database/secure-data>
- n8n queue mode documentation: <https://docs.n8n.io/hosting/scaling/queue-mode/>
- n8n queue mode environment variables: <https://docs.n8n.io/hosting/configuration/environment-variables/queue-mode/>
- Google Drive API upload documentation: <https://developers.google.com/workspace/drive/api/guides/manage-uploads>
- yt-dlp project: <https://github.com/yt-dlp/yt-dlp>
- yt-dlp supported sites notes: <https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md>
- Playwright authentication state documentation: <https://playwright.dev/docs/auth>
- Vercel sensitive environment variable documentation: <https://vercel.com/docs/environment-variables/sensitive-environment-variables>
