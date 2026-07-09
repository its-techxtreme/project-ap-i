-- Admin command outbox: Vercel enqueues; local worker/n8n processes.
-- Keeps the hosted admin UI from needing a public worker URL.

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

comment on table public.admin_commands is
  'Outbox for admin retry/delete. Hosted web inserts; local worker claims and executes.';

create index idx_admin_commands_status_created
  on public.admin_commands (status, created_at);

create unique index uniq_pending_admin_command_per_job
  on public.admin_commands (job_id, command)
  where status = 'pending';

create trigger admin_commands_set_updated_at
  before update on public.admin_commands
  for each row execute function public.set_updated_at();

alter table public.admin_commands enable row level security;

-- Admins can read their outbox (service role bypasses RLS for insert/claim).
create policy "Admins can read admin commands"
  on public.admin_commands for select
  using (public.get_my_role() = 'admin');

-- Atomic claim (same pattern as claim_next_job)
create or replace function public.claim_next_admin_command(
  worker_id text,
  lock_minutes integer default 15
)
returns public.admin_commands
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.admin_commands;
begin
  select * into claimed
  from public.admin_commands
  where status = 'pending'
     or (
       status = 'claimed'
       and (lock_expires_at is null or lock_expires_at < now())
     )
  order by created_at asc
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update public.admin_commands
  set
    status = 'claimed',
    claimed_by = worker_id,
    claimed_at = now(),
    lock_expires_at = now() + make_interval(mins => lock_minutes),
    error = null,
    updated_at = now()
  where id = claimed.id
  returning * into claimed;

  return claimed;
end;
$$;

revoke execute on function public.claim_next_admin_command(text, integer) from public;
revoke execute on function public.claim_next_admin_command(text, integer) from anon;
revoke execute on function public.claim_next_admin_command(text, integer) from authenticated;
grant execute on function public.claim_next_admin_command(text, integer) to service_role;
