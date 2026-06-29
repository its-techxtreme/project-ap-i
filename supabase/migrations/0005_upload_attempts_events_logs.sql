create table public.upload_attempts (
  id                  uuid primary key default gen_random_uuid(),
  job_id              uuid not null references public.jobs(id) on delete cascade,
  platform            text not null check (platform in ('youtube', 'instagram')),
  platform_account_id uuid references public.platform_accounts(id),
  attempt_number      integer not null,
  status              text not null default 'started',
  platform_media_id   text,
  platform_url        text,
  error_code          text,
  error_message       text,
  login_required      boolean not null default false,
  started_at          timestamptz not null default now(),
  finished_at         timestamptz
);

alter table public.upload_attempts enable row level security;

create table public.job_events (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid references public.jobs(id) on delete cascade,
  stage      text,
  event_type text not null,
  severity   text not null default 'info'
               check (severity in ('debug', 'info', 'warning', 'error')),
  message    text,
  metadata   jsonb,
  created_at timestamptz not null default now()
);

alter table public.job_events enable row level security;

create table public.audit_logs (
  id             uuid primary key default gen_random_uuid(),
  actor_user_id  uuid references public.profiles(id),
  actor_type     text not null check (actor_type in ('user', 'admin', 'worker', 'system')),
  action         text not null,
  target_type    text,
  target_id      uuid,
  ip_address     text,
  user_agent     text,
  metadata       jsonb,
  created_at     timestamptz not null default now()
);

alter table public.audit_logs enable row level security;

create table public.system_settings (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

alter table public.system_settings enable row level security;
