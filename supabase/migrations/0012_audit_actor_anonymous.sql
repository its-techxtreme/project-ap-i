-- Allow anonymous public submissions to be recorded in audit_logs.
alter table public.audit_logs
  drop constraint if exists audit_logs_actor_type_check;

alter table public.audit_logs
  add constraint audit_logs_actor_type_check
  check (actor_type in ('user', 'admin', 'worker', 'system', 'anonymous'));
