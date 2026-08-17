---
subtitle: "Deployment and Operations Runbook"
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

# Deployment and Operations Runbook

## Document control

| Field | Value |
|---|---|
| Project name | Project AP-I |
| Developer | Atharva (Techno) |
| Document | Deployment and Operations Runbook |
| Version | 1.2 |

## Deployment model (v1.2 — local-first MVP)

**MVP runs on the local developer machine.** Worker + n8n use `infra/docker-compose.yml` on localhost. Supabase and Google Drive remain cloud-hosted. Remote VPS deployment is **deferred** — see appendix **Future VPS deployment** at the end of this document.

**Canonical local runbook:** `docs/LOCAL_DEVELOPMENT.md`

## Deployment goal

Operate Project AP-I safely on the local machine for development, dry runs (Phase 14), and controlled real-upload smoke tests (Phase 15). The system must support 4 to 5 videos/day and occasional 8-video queue days without overloading the host (`MAX_FFMPEG_CONCURRENCY=1`).

## Environments

Recommended environments:

```text
local
preview
production
```

### Local (MVP — primary)

- Developer machine (Windows).
- Root `.env` + `apps/web/.env.local`.
- Supabase cloud project.
- Docker: worker on `localhost:3001`, n8n on `localhost:5678`.
- Web: `pnpm --filter @project-api/web dev` → `localhost:3000`.
- No real uploads unless explicitly enabled in local `.env`.

### Preview (optional)

- Vercel preview deployment (web only).
- Test database or protected production tables.
- Upload disabled by default.

### Production (deferred)

- Optional future: Vercel web + remote VPS worker/n8n.
- Not required for Phases 14–16 on local.

## Initial setup checklist

### Supabase

```text
Create project.
Create tables through migrations.
Enable RLS.
Create policies.
Create first admin user.
Create niches.
Create platform account mappings.
Test submitter insert.
Test admin read.
```

### Vercel

```text
Create project (rootDirectory = apps/web for this monorepo).
Add NEXT_PUBLIC_SUPABASE_URL.
Add NEXT_PUBLIC_SUPABASE_ANON_KEY.
Add SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY as sensitive server env.
Add WORKER_INTERNAL_TOKEN (server-only). Admin retry/delete no longer call the worker from Vercel.
They enqueue rows in `admin_commands`; local n8n WF-07 polls `POST /admin-commands/process-next` on the private worker.
WORKER_BASE_URL on Vercel can stay unset or point at a placeholder — it is not required for hosted admin actions.
Add APP_BASE_URL=https://<your-deployment>.vercel.app
Add ADMIN_USERNAME, ADMIN_PASSWORD_HASH, ADMIN_SESSION_SECRET (generate hash via `node --env-file=.env scripts/hash-admin-password.mjs`; never store plaintext ADMIN_PASSWORD on Vercel).
Deploy frontend: from repo root `pnpm exec vercel deploy --prod`
Add the production URL to Supabase Auth → URL Configuration → Site URL / Redirect URLs (optional; admin login no longer uses Supabase Auth).
Test public submit form (no login).
Test admin username/password login + route protection + lockout after repeated failures.
```

Production URL (current): `https://project-ap-i.vercel.app`

### Local stack (worker + n8n)

```text
pnpm install
cp .env.example .env
pnpm setup:local-env
pnpm docker:up
pnpm n8n:import          # after n8n UI login + API key (optional)
pnpm --filter @project-api/web dev
```

See `docs/LOCAL_DEVELOPMENT.md` and `infra/n8n/README.md`.

```text
Fill Supabase keys in .env and apps/web/.env.local
Create playwright-profiles/ (gitignored)
Login collector once: pnpm --filter @project-api/worker smoke:playwright -- --login --profile ig-collector
Add watermark asset for worker
Import n8n workflows
Check http://localhost:3001/health
Check http://localhost:5678 (n8n UI)
```

### Google Drive

```text
Create /ReelBot folder.
Create /processed_ready folder.
Create /failed_manual_review folder.
Configure OAuth credentials.
Store refresh token in local `.env` / n8n credentials (never commit).
Test upload.
Test delete.
```

### Playwright sessions

For each niche/platform account:

```text
Start browser profile manually.
Login to account.
Complete 2FA if required.
Confirm upload page access.
Save persistent profile.
Run account session test.
```

## Local deployment folder layout

```text
<repo-root>/
  .env
  apps/web/.env.local
  infra/docker-compose.yml
  playwright-profiles/     ← gitignored
  apps/worker/assets/watermark.png
```

Docker volumes (n8n data) are managed by Compose. See `infra/docker-compose.yml`.

## Recommended Docker commands

```bash
pnpm docker:up
pnpm docker:logs
# or from repo root:
docker compose -f infra/docker-compose.yml ps
docker compose -f infra/docker-compose.yml logs -f worker
```

## Health checks

### Worker health

```bash
curl -H "X-Worker-Token: $WORKER_INTERNAL_TOKEN" http://localhost:3001/health
```

Expected:

```json
{
  "ok": true,
  "ffmpeg": true,
  "ytDlp": true,
  "playwright": true
}
```

### n8n health

Open n8n UI and verify workflows are active.

### Supabase health

Submit a test job and confirm row appears.

### Drive health

Upload and delete a small test file through worker.

## Operating procedure

### Daily check

Admin should check:

```text
Failed jobs
Login-required accounts
Drive files in failed_manual_review
Jobs stuck in locked/processing
Worker health
n8n failed executions
```

### Weekly check

```text
Host disk usage
Docker logs size
n8n execution data size
Supabase table growth
Playwright session health
Drive failed folder size
```

## Resource monitoring

On local machine:

```bash
# Windows: Task Manager / Resource Monitor
# Docker Desktop → Containers → stats
docker stats
du -sh playwright-profiles tmp 2>/dev/null || true
```

Alert thresholds:

```text
Disk usage > 75 percent: investigate
Disk usage > 85 percent: pause processing
RAM usage > 85 percent sustained: pause processing
CPU > 90 percent for long periods: reduce concurrency
```

## Temp cleanup

Worker should delete temp job folders automatically. Add a safety cron:

```bash
find ./tmp/jobs -mindepth 1 -maxdepth 1 -type d -mmin +180 -exec rm -rf {} \; 2>/dev/null || true
```

Only use this for temp folders, never Drive-mounted permanent data.

## Log rotation

Use Docker log rotation or system logrotate.

Example Docker daemon config:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "5"
  }
}
```

## n8n data pruning

Configure n8n execution pruning to avoid disk growth.

Recommended:

```text
Keep failed executions.
Prune successful executions.
Do not store binary data in n8n.
```

## Backup approach

### Local backups

Back up manually:

```text
.env securely (offline)
n8n workflow exports (infra/n8n/workflows/ in git + UI export)
playwright-profiles/ if needed (sensitive — encrypt)
watermark asset
```

Do not share backups containing secrets casually.

### Supabase

Keep SQL migrations in Git. Periodically export schema.

### Google Drive

Drive itself stores staged files. Since success files are deleted, failed files should remain until manual cleanup.

## Rollback plan

If a bad deployment happens:

```text
1. Pause n8n workflows.
2. Stop worker container.
3. Revert code to previous commit.
4. Rebuild worker.
5. Restart worker.
6. Resume n8n.
7. Retry failed jobs manually.
```

## Common failure scenarios

### Scenario: Account login required

Symptoms:

```text
Upload fails with login_required.
Account page shows login_required.
Jobs for that account become needs_manual_review or retryable_after_login.
```

Fix:

```text
1. Admin opens session refresh process.
2. Manually login to account in persistent profile.
3. Complete 2FA/challenge.
4. Mark account login recovered.
5. Retry failed jobs.
```

### Scenario: yt-dlp fails

Symptoms:

```text
DOWNLOAD_FAILED
unsupported extractor or site changed
```

Fix:

```text
1. Update yt-dlp.
2. Retry job.
3. If still failing, mark manual review.
```

### Scenario: FFmpeg fails

Symptoms:

```text
FFMPEG_FAILED
invalid input format or processing timeout
```

Fix:

```text
1. Check source file.
2. Check duration/format.
3. Retry full processing.
4. If repeated, mark manual review.
```

### Scenario: Drive upload fails

Symptoms:

```text
DRIVE_UPLOAD_FAILED
OAuth/token/network error
```

Fix:

```text
1. Check Drive token.
2. Check internet connectivity.
3. Check folder ID.
4. Retry processing/staging.
```

### Scenario: Drive cleanup fails

Symptoms:

```text
Job completed but drive_cleanup_failed.
```

Fix:

```text
1. Use admin cleanup button.
2. If still failing, delete manually in Drive.
3. Mark cleaned in dashboard if needed.
```

### Scenario: Job stuck locked

Symptoms:

```text
Job status locked/processing for longer than timeout.
```

Fix:

```text
1. Check worker logs.
2. Release stale lock through admin action.
3. Retry job.
```

## Production safeguards

Before running live jobs:

```text
Test one YouTube account.
Test one Instagram account.
Test one job end-to-end.
Test failed upload retry.
Test Drive deletion.
Test login_required handling.
Test invalid URL rejection.
Test admin-only route protection.
```

## Launch plan

### Day 1

- Deploy frontend.
- Deploy database.
- Deploy worker health only.
- Confirm auth and admin roles.

### Day 2

- Enable submission and queue.
- Test one fake/test job.
- Test Drive upload/delete.

### Day 3

- Test FFmpeg processing with watermark.
- Test metadata generation.

### Day 4

- Setup Playwright profiles.
- Test YouTube upload with test account.
- Test Instagram upload with test account.

### Day 5

- Enable real niche mappings.
- Process 1 to 2 real approved videos.
- Monitor failures.

### Week 2

- Increase to 4 to 5 videos/day.
- Add account health checks if needed.
- Improve admin UX based on real failures.

## Operations acceptance checklist

- Worker restarts automatically.
- n8n workflows active.
- Worker health endpoint works.
- Disk cleanup works.
- Docker logs do not grow endlessly.
- Admin can recover failed jobs without SSH.
- Admin can delete failed Drive files.
- Login-required state is visible.
- Queue does not process more than one FFmpeg job at once.

## Finalized MVP launch configuration - Version 1.1

Before first production run, create and validate these six account mappings:

| Niche | YouTube account | Instagram account | Status before launch |
|---|---|---|---|
| Memes | To be filled by admin | To be filled by admin | Login profile warmed and tested. |
| Anime | To be filled by admin | To be filled by admin | Login profile warmed and tested. |
| Sports | To be filled by admin | To be filled by admin | Login profile warmed and tested. |

Launch rule:

```text
Do not run full automation until one test upload has passed for each niche/account pair.
```

Because there are three niches and two target platforms each, MVP readiness requires six successful upload path tests.

## Future VPS deployment (deferred)

When moving off the local machine to a remote VPS (e.g. Hostinger KVM):

```text
Clone repo to /opt/project-ap-i
Copy .env with restricted permissions (chmod 600)
Use infra/nginx.example.conf for reverse proxy + TLS
Mount playwright-profiles outside the repo
Set WORKER_BASE_URL to public or VPN-only URL for n8n
Keep REAL_UPLOADS_ENABLED=false until Phase 15 smoke test on that host
```

This is **not required** for Phases 14–16 while running locally. See v1.1 Hostinger notes in git history if needed.

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
