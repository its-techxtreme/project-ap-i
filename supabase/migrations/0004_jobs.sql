create table public.jobs (
  id                         uuid primary key default gen_random_uuid(),
  public_job_code            text unique,
  submitted_by               uuid references public.profiles(id),
  source_url                 text not null,
  normalized_source_url      text,
  source_platform            text not null check (source_platform in ('youtube', 'instagram')),
  niche_id                   uuid not null references public.niches(id),
  rights_confirmed           boolean not null default false,

  -- Main lifecycle status
  status                     text not null default 'queued',

  -- Stage sub-statuses
  download_status            text not null default 'pending',
  processing_status          text not null default 'pending',
  metadata_status            text not null default 'pending',
  youtube_upload_status      text not null default 'pending',
  instagram_upload_status    text not null default 'pending',
  verification_status        text not null default 'pending',

  -- Resolved target accounts (set by worker, not submitter)
  target_youtube_account_id  uuid references public.platform_accounts(id),
  target_instagram_account_id uuid references public.platform_accounts(id),

  -- Drive staging
  drive_file_id              text,
  drive_file_name            text,
  drive_view_url             text,
  drive_folder_state         text,
  drive_deleted_at           timestamptz,

  -- Generated metadata
  youtube_title              text,
  youtube_description        text,
  instagram_caption          text,

  -- Retry tracking
  retry_count                integer not null default 0,
  youtube_retry_count        integer not null default 0,
  instagram_retry_count      integer not null default 0,
  failure_code               text,
  failure_reason             text,

  -- Job locking
  locked_by                  text,
  locked_at                  timestamptz,
  lock_expires_at            timestamptz,
  verification_due_at        timestamptz,

  -- Timestamps
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  processed_at               timestamptz,
  uploaded_at                timestamptz,
  completed_at               timestamptz,

  -- Constraints
  constraint jobs_rights_confirmed_true check (rights_confirmed = true)
);

alter table public.jobs enable row level security;
