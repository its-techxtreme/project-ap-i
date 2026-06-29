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
| Version | 1.1 |

## Deployment goal

Deploy Project AP-I with minimal cost while keeping operations safe on the existing Hostinger KVM 2 VPS. The system must support 4 to 5 videos/day and occasional 8-video days without overloading the VPS.

## Environments

Recommended environments:

```text
local
preview
production
```

### Local

- Developer machine.
- Local `.env.local`.
- Supabase development project or production with safe test data.
- No real uploads unless explicitly enabled.

### Preview

- Vercel preview deployment.
- Test database or protected production tables.
- Upload disabled by default.

### Production

- Vercel production app.
- Supabase production project.
- VPS worker/n8n.
- Google Drive production folders.
- Real Playwright account profiles.

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
Create project.
Add NEXT_PUBLIC_SUPABASE_URL.
Add NEXT_PUBLIC_SUPABASE_ANON_KEY.
Add server-only secrets as sensitive environment variables.
Deploy frontend.
Test login.
Test submit form.
Test admin route protection.
```

### VPS

```text
Create /opt/project-ap-i.
Clone repo or upload worker build.
Create .env with restricted permissions.
Create Docker Compose file.
Add watermark image.
Create temp, logs, and profile folders.
Start worker.
Check /health.
Start n8n.
Import workflows.
```

### Google Drive

```text
Create /ReelBot folder.
Create /processed_ready folder.
Create /failed_manual_review folder.
Configure OAuth credentials.
Store refresh token in VPS/n8n secret storage.
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

## Deployment folder layout

```text
/opt/project-ap-i
  .env
  docker-compose.yml
  /assets
    watermark.png
  /tmp
    /jobs
  /logs
  /playwright-profiles
  /n8n_data
```

## Recommended Docker commands

```bash
cd /opt/project-ap-i
docker compose pull
docker compose build
docker compose up -d
docker compose ps
docker compose logs -f worker
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
VPS disk usage
Docker logs size
n8n execution data size
Supabase table growth
Playwright session health
Drive failed folder size
```

## Resource monitoring

On VPS:

```bash
htop
df -h
du -sh /opt/project-ap-i/*
docker stats
docker system df
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
find /opt/project-ap-i/tmp/jobs -mindepth 1 -maxdepth 1 -type d -mmin +180 -exec rm -rf {} \;
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

### VPS

Hostinger weekly backup is already enabled. That helps but should not be the only source of recovery.

Back up manually:

```text
.env securely
n8n workflow exports
Docker Compose file
Playwright profiles if needed
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
