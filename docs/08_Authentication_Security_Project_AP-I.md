---
subtitle: "Authentication and Security Specification"
author: "Atharva (Techno)"
date: "2026-06-29"
geometry: margin=0.72in
fontsize: 10pt
mainfont: DejaVu Sans
monofont: DejaVu Sans Mono
colorlinks: true
linkcolor: blue
urlcolor: blue
toc: true
numbersections: true
---

# Authentication and Security Specification

## Document control

| Field | Value |
|---|---|
| Project name | Project AP-I |
| Developer | Atharva (Techno) |
| Document | Authentication and Security Specification |
| Version | 1.1 |

## Security objective

Project AP-I must be secure enough for a real agency workflow, even during MVP. The system handles platform accounts, private workflow state, client-approved links, Google Drive files, and automation credentials. The main security objective is to prevent unauthorized access, secret leakage, malicious URL abuse, destructive admin misuse, and accidental public exposure of sensitive backend keys.

## Threat model

### Assets to protect

```text
Supabase service role key
Supabase database rows
Google Drive OAuth tokens
AI provider API key
n8n credentials
Playwright browser profiles/cookies
Platform account usernames/passwords if stored
Internal worker token
Client-approved source links
Edited staged videos
Admin dashboard access
```

### Threat actors

```text
Unauthenticated visitor
Low-privilege submitter
Compromised submitter account
External attacker submitting malicious URLs
Attacker reading frontend JavaScript bundle
Attacker scanning worker/n8n endpoints
Accidental admin mistake
```

## Authentication model

Use Supabase Auth.

Roles:

```text
submitter
admin
```

Role lives in `profiles.role` and is checked server-side.

### Public submission (anonymous)

Product decision: the main submit page is public. No submitter account or signup is required.

Allowed actions:

- Submit jobs via server action (service role insert, `submitted_by` null).
- Rate limited by client IP (MVP in-memory; Redis later).

Not allowed:

- Accessing `/admin/*`
- Choosing target platform accounts
- Reading other jobs or account credentials

### Admin authentication

Admin signs in with a **username + password** configured via server env (not Supabase Auth email).

```text
ADMIN_USERNAME
ADMIN_PASSWORD_HASH   # scrypt hash from scripts/hash-admin-password.mjs
ADMIN_SESSION_SECRET  # >= 32 chars; signs httpOnly session cookie
```

Security controls:

```text
Password verified with scrypt (never store plaintext on Vercel)
Signed httpOnly session cookie (12h TTL)
Login attempt lockout: 5 failures / IP / 15 min; 10 / username / 15 min
Generic error messages (no user enumeration)
Audit logs for admin_login and admin_login_failed
```

Allowed actions:

- View all jobs.
- Retry jobs.
- Delete Drive files.
- Manage niches and accounts.
- View logs.

## Authorization model

Authorization must exist in three layers:

1. Frontend UI hiding irrelevant controls.
2. Server-side route/action checks.
3. Supabase RLS policies.

Never rely only on frontend checks.

## Supabase RLS requirements

Enable RLS on every public table.

Minimum:

```sql
alter table public.profiles enable row level security;
alter table public.niches enable row level security;
alter table public.platform_accounts enable row level security;
alter table public.jobs enable row level security;
alter table public.upload_attempts enable row level security;
alter table public.job_events enable row level security;
alter table public.audit_logs enable row level security;
alter table public.system_settings enable row level security;
```

### Critical Supabase rule

The service role key bypasses RLS and must never be exposed to browser code. Supabase documentation explicitly warns that service/secret keys should not be exposed publicly or used in browsers.

## Secret storage model

### Vercel

Use Vercel sensitive environment variables for server-side secrets. Only expose values prefixed with `NEXT_PUBLIC_` if they are intended for browser use.

Browser-safe:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Server-only:

```text
SUPABASE_SERVICE_ROLE_KEY
WORKER_INTERNAL_TOKEN
```

### Local machine

Use `.env` with restricted permissions. Never commit it.

```bash
chmod 600 .env   # Git Bash / WSL
```

### n8n

Use n8n credentials where possible and set a stable `N8N_ENCRYPTION_KEY`.

### Playwright browser profiles

Playwright auth state/cookies are sensitive. Store them outside Git and with restricted file permissions.

```text
<repo-root>/playwright-profiles/    ← gitignored
```

Permissions (when on Linux/WSL):

```bash
chmod -R 700 playwright-profiles
```

## Platform credential strategy

Preferred MVP approach:

```text
1. Login manually once per account.
2. Save persistent browser profile/session.
3. Use session for uploads.
4. If session expires, mark account login_required.
5. Admin manually logs in again.
```

Fallback credential storage:

- Store credentials only if absolutely required.
- Prefer n8n encrypted credentials or local `.env` (never committed).
- Do not store raw passwords in Supabase.
- Do not expose credentials in logs.

Do not automate CAPTCHA or 2FA bypass.

## Worker API security

Worker endpoints must not be publicly usable.

Minimum protections:

```text
X-Worker-Token header
HTTPS if public endpoint
IP restriction if possible
Reverse proxy route restrictions if possible
No unauthenticated destructive endpoints
Request body validation with Zod
Rate limit endpoints
```

For admin actions:

```text
Browser -> Vercel server route -> admin role check -> worker API
```

The browser should not call worker directly.

## URL security

User-submitted URLs are a key attack surface.

### Allowlist only

Allow only:

```text
instagram.com
www.instagram.com
youtube.com
www.youtube.com
m.youtube.com
youtu.be
```

Reject:

```text
localhost
127.0.0.1
0.0.0.0
private IP addresses
internal hostnames
unsupported shorteners
file:// URLs
data: URLs
javascript: URLs
unknown redirects
```

### SSRF protection

If backend follows redirects or fetches URLs, it must reject redirects to private IP ranges.

Private ranges to reject include:

```text
10.0.0.0/8
172.16.0.0/12
192.168.0.0/16
127.0.0.0/8
169.254.0.0/16
::1
fc00::/7
fe80::/10
```

## Input validation

Validate all inputs both client-side and server-side.

Submission schema:

```text
source_url: valid URL, allowed domain
source_platform: youtube or instagram
niche_id: UUID, active niche
rights_confirmed: true
```

Admin actions:

```text
job_id: UUID
action: allowed enum
reason optional text with max length
delete confirmation required for destructive actions
```

## Rate limiting

Recommended MVP limits:

```text
Submitter submissions: 20/day/user
Submission burst: 5/minute/user
Admin login: 5 failures/IP/15min and 10 failures/username/15min then lockout
Admin destructive actions: 20/hour/admin
Worker process-next endpoint: internal only
```

If the page is public-facing, add CAPTCHA or invite-code.

## File security

### Local temp files

- Store only in `/tmp/jobs/<jobId>`.
- Never use user-controlled filenames directly.
- Sanitize generated filenames.
- Delete temp folder after job stage.
- Set max file size.

### Drive files

- Store edited files only.
- Delete after verified success.
- Keep failed files for manual review.
- Do not share Drive folders publicly unless absolutely required.

## Logging security

Do not log:

```text
Passwords
OAuth tokens
Refresh tokens
Service role key
Worker token
Full cookies
Full Playwright storage state
```

Safe to log:

```text
Job ID
Stage
Status
Short error code
Truncated source domain/path
Account label, not password
Drive file ID if needed for admin
```

## Admin destructive actions

Destructive actions include:

- Delete Drive file.
- Mark job ignored.
- Disable account.
- Delete niche/account mapping.

Requirements:

- Admin role required.
- Confirmation dialog.
- Audit log record.
- Result displayed to admin.

## Session management

### Supabase session

- Use secure cookies when possible.
- Server-side role checks for admin.
- Logout support.

### Playwright session

- One browser profile per platform account.
- Do not commit profile files to Git.
- Mark account `login_required` when challenge appears.
- Admin manually refreshes session.

## Network security

Recommended:

- Use HTTPS for n8n and worker if exposed.
- Restrict n8n editor access with strong auth.
- Avoid exposing worker publicly; if exposed, use token and firewall/IP rules.
- Keep SSH secured with keys if possible.
- Disable password SSH login if practical.

## Local host hardening checklist

```text
Update packages regularly.
Use Docker containers for worker/n8n.
Restrict .env permissions.
Restrict Playwright profile permissions.
Run worker as non-root user if practical.
Configure firewall for only needed ports.
Keep n8n behind auth.
Backup important config.
Prune Docker images/logs.
```

## Compliance and platform policy risk

Even when content is client-approved, browser automation can be fragile and may conflict with platform behavior expectations. The system must not include CAPTCHA bypassing, stealth evasion, or attempts to defeat login challenges. The production-safe path is to migrate to official APIs where feasible.

## Incident response

### Suspected secret leak

1. Revoke leaked key/token.
2. Rotate Supabase service role key if exposed.
3. Rotate Google OAuth credentials if exposed.
4. Rotate worker token.
5. Rotate AI provider key.
6. Check audit logs.
7. Redeploy with new secrets.

### Compromised submitter

1. Disable user in Supabase/Auth.
2. Review recent submissions.
3. Cancel queued jobs if needed.
4. Review audit logs.

### Compromised platform session

1. Manually log out all sessions from platform.
2. Change password if needed.
3. Delete local Playwright profile.
4. Re-login manually.
5. Mark account recovered.

## Security acceptance checklist

- RLS enabled on all public tables.
- Browser bundle contains no service role key.
- Worker endpoints require token.
- Admin routes reject submitter users.
- URL allowlist tested.
- Private IP/localhost URL blocked.
- Secrets not logged.
- Playwright profiles outside Git.
- Drive deletion requires admin and audit log.
- Login-required flow works without CAPTCHA bypass.
- n8n encryption key configured.


# References

- YouTube Data API video resources and upload behavior: <https://developers.google.com/youtube/v3/docs/videos>
- YouTube Data API upload guide: <https://developers.google.com/youtube/v3/guides/uploading_a_video>
- Instagram Platform content publishing documentation: <https://developers.facebook.com/docs/instagram-platform/content-publishing/>
- Supabase Row Level Security documentation: <https://supabase.com/docs/guides/database/postgres/row-level-security>
- Supabase API keys and service role key guidance: <https://supabase.com/docs/guides/getting-started/api-keys>
- Supabase secure data guidance: <https://supabase.com/docs/guides/database/secure-data>
- n8n queue mode documentation: <https://docs.n8n.io/hosting/scaling/queue-mode/>
- n8n queue mode environment variables: <https://docs.n8n.io/hosting/configuration/environment-variables/queue-mode/>
- Google Drive API upload documentation: <https://developers.google.com/workspace/drive/api/guides/manage-uploads>
- yt-dlp project: <https://github.com/yt-dlp/yt-dlp>
- yt-dlp supported sites notes: <https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md>
- Playwright authentication state documentation: <https://playwright.dev/docs/auth>
- Vercel sensitive environment variable documentation: <https://vercel.com/docs/environment-variables/sensitive-environment-variables>
