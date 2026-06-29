create table public.niches (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique
               check (slug in ('memes', 'anime', 'sports')),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.niches enable row level security;

create table public.platform_accounts (
  id                         uuid primary key default gen_random_uuid(),
  niche_id                   uuid not null references public.niches(id) on delete cascade,
  platform                   text not null check (platform in ('youtube', 'instagram')),
  account_label              text not null,
  username_hint              text,
  browser_profile_path       text,
  status                     text not null default 'active'
                               check (status in ('active', 'paused', 'login_required', 'failing', 'disabled')),
  login_required             boolean not null default false,
  failure_count              integer not null default 0,
  last_successful_upload_at  timestamptz,
  last_session_check_at      timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique(niche_id, platform)
);

alter table public.platform_accounts enable row level security;

-- Guardrail: only one active account per niche/platform
create unique index if not exists uniq_active_platform_account_per_niche
  on public.platform_accounts (niche_id, platform)
  where status = 'active';
