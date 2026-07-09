-- Admin login attempt tracking for lockout / rate limits (hosted username auth).

create table public.admin_login_attempts (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null,
  username_norm text,
  success boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.admin_login_attempts is
  'Failed/successful admin login attempts. Used for IP and username lockouts.';

create index idx_admin_login_attempts_ip_created
  on public.admin_login_attempts (ip_hash, created_at desc);

create index idx_admin_login_attempts_user_created
  on public.admin_login_attempts (username_norm, created_at desc)
  where username_norm is not null;

alter table public.admin_login_attempts enable row level security;

-- No anon/authenticated policies: service role only (web server actions).
