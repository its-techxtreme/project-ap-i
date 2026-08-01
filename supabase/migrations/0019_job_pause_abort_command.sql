-- Job pause status + abort_job admin command for hosted admin control.

-- admin_commands: allow abort_job (cancel/pause mid-flight via worker)
alter table public.admin_commands
  drop constraint if exists admin_commands_command_check;

alter table public.admin_commands
  add constraint admin_commands_command_check
  check (command in ('retry_upload', 'delete_drive_file', 'abort_job'));

comment on table public.admin_commands is
  'Outbox for admin retry/delete/abort. Hosted web inserts; local worker claims and executes.';

-- claim_next_job already only selects status=queued (and expired locked).
-- Document that paused jobs are never claimed. No SQL change required for skip,
-- but keep claim comment accurate.
comment on function public.claim_next_job(text, integer) is
  'Atomically claim next queued job (never paused/cancelled/ignored). Skips rolling-24h daily upload deferrals; NULL-safe. Reclaims expired locks.';
