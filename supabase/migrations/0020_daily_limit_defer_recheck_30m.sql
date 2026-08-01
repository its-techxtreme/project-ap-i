-- Re-check daily-limit deferred queued jobs every 30 minutes instead of 24h.
-- claimJob still enforces real account caps; this only stops permanent parking
-- when capacity frees earlier in the rolling upload window.

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
  -- Short cool-down so WF-01 can re-test niche capacity after a deferral.
  defer_recheck_after timestamptz := now() - interval '30 minutes';
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
      and updated_at >= defer_recheck_after
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
  'Claim next queued job; skip DAILY_UPLOAD_LIMIT_REACHED deferrals only for 30 minutes (NULL-safe). Reclaims expired locks.';
