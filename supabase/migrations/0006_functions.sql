create or replace function public.claim_next_job(
  worker_id    text,
  lock_minutes integer default 45
)
returns public.jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.jobs;
begin
  -- Atomically select and lock one queued job (SKIP LOCKED prevents double-claim)
  select * into claimed
  from public.jobs
  where status = 'queued'
    and rights_confirmed = true
    and (lock_expires_at is null or lock_expires_at < now())
  order by created_at asc
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  -- Update the claimed job atomically
  update public.jobs
  set
    status          = 'locked',
    locked_by       = worker_id,
    locked_at       = now(),
    lock_expires_at = now() + make_interval(mins => lock_minutes),
    updated_at      = now()
  where id = claimed.id
  returning * into claimed;

  return claimed;
end;
$$;

-- updated_at trigger helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger niches_set_updated_at
  before update on public.niches
  for each row execute function public.set_updated_at();

create trigger platform_accounts_set_updated_at
  before update on public.platform_accounts
  for each row execute function public.set_updated_at();
