-- Collector inbox: DMs ingested from the Instagram collector profile.
-- pending_niche rows wait for admin niche confirm before becoming jobs.

create table public.collector_inbox_items (
  id                   uuid primary key default gen_random_uuid(),
  normalized_source_url text not null unique,
  source_url           text not null,
  sender_username      text,
  thread_id            text,
  niche_slug           text check (niche_slug is null or niche_slug in ('memes', 'anime', 'sports')),
  status               text not null default 'pending_niche'
                         check (status in ('pending_niche', 'queued', 'duplicate', 'invalid')),
  job_id               uuid references public.jobs(id) on delete set null,
  skip_reason          text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_collector_inbox_pending
  on public.collector_inbox_items (created_at desc)
  where status = 'pending_niche';

alter table public.collector_inbox_items enable row level security;

create policy "Admins can manage collector inbox items"
  on public.collector_inbox_items for all
  using (public.get_my_role() = 'admin');
