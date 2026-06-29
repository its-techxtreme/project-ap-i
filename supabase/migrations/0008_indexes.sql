create index idx_jobs_status_created_at
  on public.jobs(status, created_at);

create index idx_jobs_niche_id
  on public.jobs(niche_id);

create index idx_jobs_submitted_by
  on public.jobs(submitted_by);

create index idx_jobs_verification_due
  on public.jobs(status, verification_due_at);

create index idx_jobs_locked_by
  on public.jobs(locked_by)
  where locked_by is not null;

create index idx_upload_attempts_job_platform
  on public.upload_attempts(job_id, platform);

create index idx_job_events_job_created
  on public.job_events(job_id, created_at);

create index idx_audit_logs_created
  on public.audit_logs(created_at);

create index idx_audit_logs_actor
  on public.audit_logs(actor_user_id, created_at);
