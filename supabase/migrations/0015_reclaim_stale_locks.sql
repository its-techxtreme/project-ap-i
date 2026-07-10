-- Phase 16: reclaim expired locked jobs so crashed workers do not strand work forever.
-- claim_next_job may select:
--   - status = 'queued', or
--   - status = 'locked' with lock_expires_at < now()

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
  was_stale boolean := false;
begin
  select * into claimed
  from public.jobs
  where rights_confirmed = true
    and (
      status = 'queued'
      or (status = 'locked' and lock_expires_at is not null and lock_expires_at < now())
    )
  order by created_at asc
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  was_stale := (claimed.status = 'locked');

  update public.jobs
  set
    status          = 'locked',
    locked_by       = worker_id,
    locked_at       = now(),
    lock_expires_at = now() + make_interval(mins => lock_minutes),
    updated_at      = now()
  where id = claimed.id
  returning * into claimed;

  if was_stale then
    insert into public.job_events (job_id, stage, event_type, message, severity)
    values (
      claimed.id,
      'claim',
      'lock_reclaimed',
      'Expired lock reclaimed by worker ' || worker_id,
      'warning'
    );
  end if;

  return claimed;
end;
$$;

comment on function public.claim_next_job(text, integer) is
  'Atomically claim next queued job, or reclaim a locked job whose lock has expired.';
