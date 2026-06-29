-- Helper: get current user role from profiles
create or replace function public.get_my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- =========================================================
-- profiles
-- =========================================================
-- Users can read their own profile
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Admins can read all profiles
create policy "Admins can read all profiles"
  on public.profiles for select
  using (public.get_my_role() = 'admin');

-- Users can update their own limited profile fields
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- =========================================================
-- niches
-- =========================================================
-- Authenticated users can read active niches (needed for form dropdown)
create policy "Authenticated users can read active niches"
  on public.niches for select
  using (auth.role() = 'authenticated' and is_active = true);

-- Admins can read all niches
create policy "Admins can read all niches"
  on public.niches for select
  using (public.get_my_role() = 'admin');

-- Admins can manage niches
create policy "Admins can manage niches"
  on public.niches for all
  using (public.get_my_role() = 'admin');

-- =========================================================
-- platform_accounts
-- =========================================================
-- Admins can read and manage platform accounts
create policy "Admins can manage platform accounts"
  on public.platform_accounts for all
  using (public.get_my_role() = 'admin');

-- Submitters cannot read sensitive account details
-- (No select policy for submitters = they cannot query this table)

-- =========================================================
-- jobs
-- =========================================================
-- Submitters can insert jobs (only for themselves, rights_confirmed must be true)
create policy "Submitters can insert own jobs"
  on public.jobs for insert
  with check (
    auth.uid() = submitted_by
    and rights_confirmed = true
  );

-- Admins can read and manage all jobs
create policy "Admins can manage all jobs"
  on public.jobs for all
  using (public.get_my_role() = 'admin');

-- Optional: submitters can read their own jobs
create policy "Submitters can read own jobs"
  on public.jobs for select
  using (auth.uid() = submitted_by);

-- =========================================================
-- upload_attempts
-- =========================================================
-- Admins can read all upload attempts
create policy "Admins can read upload attempts"
  on public.upload_attempts for select
  using (public.get_my_role() = 'admin');

-- =========================================================
-- job_events
-- =========================================================
-- Admins can read all job events
create policy "Admins can read job events"
  on public.job_events for select
  using (public.get_my_role() = 'admin');

-- =========================================================
-- audit_logs
-- =========================================================
-- Admins can read audit logs
create policy "Admins can read audit logs"
  on public.audit_logs for select
  using (public.get_my_role() = 'admin');

-- =========================================================
-- system_settings
-- =========================================================
-- Admins can read and update system settings
create policy "Admins can manage system settings"
  on public.system_settings for all
  using (public.get_my_role() = 'admin');
