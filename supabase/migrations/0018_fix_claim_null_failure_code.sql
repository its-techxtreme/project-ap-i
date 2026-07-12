-- Fix claim_next_job excluding rows where failure_code IS NULL.
-- In SQL, `NOT (NULL = 'X' AND ...)` evaluates to NULL, so WHERE drops the row.
-- Healthy queued jobs (failure_code null) were never claimed.

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
  window_start timestamptz := now() - interval '24 hours';
begin
  select * into claimed
  from public.jobs
  where rights_confirmed = true
    and (
      status = 'queued'
      or (status = 'locked' and lock_expires_at is not null and lock_expires_at < now())
    )
    and not (
      failure_code is not distinct from 'DAILY_UPLOAD_LIMIT_REACHED'
      and updated_at >= window_start
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
    updated_at      = now(),
    failure_code    = case
                        when failure_code is not distinct from 'DAILY_UPLOAD_LIMIT_REACHED' then null
                        else failure_code
                      end,
    failure_reason  = case
                        when failure_code is not distinct from 'DAILY_UPLOAD_LIMIT_REACHED' then null
                        else failure_reason
                      end
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
  'Atomically claim next queued job (skipping rolling-24h daily upload deferrals; NULL-safe), or reclaim an expired lock.';
