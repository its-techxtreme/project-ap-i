---
subtitle: "System Architecture Specification"
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

# System Architecture Specification

## Document control

| Field | Value |
|---|---|
| Project name | Project AP-I |
| Developer | Atharva (Techno) |
| Document | System Architecture Specification |
| Version | 1.1 |
| Architecture style | Event-driven job pipeline with orchestrated workers |

## Architecture summary

Project AP-I uses a split architecture:

- Vercel hosts the web application.
- Supabase stores users, jobs, account mappings, statuses, and audit logs.
- n8n orchestrates workflows on the **local machine** (Docker, localhost:5678).
- A Dockerized worker service performs heavy tasks.
- Google Drive stores temporary edited videos until upload verification.
- Playwright-based uploaders publish to YouTube and Instagram in the MVP.

n8n is the coordinator, not the compute engine. The worker is the compute engine. Supabase is the source of truth. Google Drive is only file staging.

## High-level system diagram

```text
+-------------------------+
| Submitter/Admin Browser |
+-----------+-------------+
            |
            v
+-------------------------+        +----------------------+
| Vercel Next.js Web App  | <----> | Supabase Auth + DB   |
+-----------+-------------+        +----------+-----------+
            |                                 ^
            | creates job                     | status/logs
            v                                 |
+-------------------------+        +----------+-----------+
| n8n Orchestrator        | <----> | Worker API (local)   |
| Local Docker / native   |        | Node.js worker       |
+-----------+-------------+        +----------+-----------+
            |                                 |
            | workflow calls                  | local temp processing
            v                                 v
+-------------------------+        +----------------------+
| Google Drive Staging    | <----> | yt-dlp + FFmpeg      |
+-----------+-------------+        +----------+-----------+
            ^                                 |
            | staged file                     v
            |                       +----------------------+
            |                       | Playwright Uploaders |
            |                       | YouTube + Instagram  |
            |                       +----------+-----------+
            |                                  |
            +----------------------------------+
                    upload result and cleanup
```

## Core architectural principles

### 1. Supabase is the source of truth

All job statuses, mappings, retry counts, failure reasons, Drive file IDs, and audit logs live in Supabase. Google Drive does not determine job state.

### 2. n8n orchestrates only

n8n should schedule, route, call APIs, update statuses, and perform small transformations. It should not run long FFmpeg commands directly as the primary processing layer.

### 3. Worker handles heavy work

The worker handles:

- URL validation re-check.
- Download.
- FFmpeg processing.
- Google Drive upload/delete.
- Metadata generation calls.
- Playwright upload execution.
- Upload verification.

### 4. Uploaders are adapters

The uploader interface should be independent from Playwright. This allows future replacement with official APIs.

Recommended abstraction:

```text
UploaderAdapter
  upload(job, file, metadata, account) -> UploadResult
  verify(upload_result, account) -> VerificationResult
  refresh_session(account) -> SessionResult
```

MVP implementations:

```text
YoutubePlaywrightUploader
InstagramPlaywrightUploader
```

Future implementations:

```text
YoutubeApiUploader
InstagramGraphApiUploader
```

### 5. Processing is queue-limited

The MVP host machine should keep FFmpeg serialized (`MAX_FFMPEG_CONCURRENCY=1`) to avoid CPU/RAM spikes during video processing.

### 6. Security is layered

Security is not a hidden URL. Security uses Auth, RLS, server-side checks, internal worker tokens, environment secrets, and audit logs.

## Runtime components

### Vercel web app

Responsibilities:

- Auth UI.
- Submitter dashboard.
- Admin dashboard.
- Form validation.
- Calling safe backend/server actions.
- Displaying job status.

Should not:

- Store service role key.
- Process video.
- Store platform credentials.
- Directly call worker service from browser.

### Supabase

Responsibilities:

- Authentication.
- Postgres database.
- RLS authorization.
- Job source of truth.
- Account mappings.
- Audit logs.

Tables:

```text
profiles
niches
platform_accounts
jobs
upload_attempts
account_sessions
audit_logs
system_settings
```

### n8n

Responsibilities:

- Detect queued jobs.
- Lock or request work.
- Trigger worker endpoints.
- Schedule verification checks.
- Send notifications.
- Execute cleanup workflows.

MVP mode:

- Single n8n instance with cron/polling and webhook flows.

Future mode:

- Queue mode with Redis and worker instances.

### Worker service

Recommended implementation:

- Python FastAPI or Node.js service.
- Dockerized.
- Runs on localhost (Docker or native Node), reachable by n8n and the web app server actions.
- Uses service role credentials only on server side.

Responsibilities:

- Job locking.
- URL normalization.
- Download with yt-dlp.
- FFmpeg processing.
- Drive upload/delete.
- Metadata generation.
- Playwright upload.
- Verification.
- Logs.

### Google Drive

Responsibilities:

- Storing edited staged videos waiting for upload verification.
- Keeping failed files for manual review.

Not responsible for:

- Job status.
- Database metadata.
- Authentication roles.

### Playwright uploader containers

Recommended separation:

```text
worker-core
worker-upload-youtube
worker-upload-instagram
```

For MVP, one worker image can contain all modules. But code should still separate these internally.

## Deployment topology

```text
<repo-root>/
  .env
  infra/docker-compose.yml
  playwright-profiles/     ← gitignored
  apps/worker/assets/watermark.png
  tmp/jobs/
```

Services (local Docker):

```text
n8n
worker-api
postgres is Supabase external
redis optional future
reverse-proxy optional
watchtower optional only after controlled testing
```

## Processing flow

```text
1. Job created in Supabase with status queued.
2. n8n detects queued job.
3. n8n calls worker /jobs/{id}/process.
4. Worker locks job.
5. Worker creates temp folder.
6. Worker downloads source media.
7. Worker applies FFmpeg preset.
8. Worker uploads edited file to Google Drive.
9. Worker deletes local temp source/output files.
10. Worker generates metadata.
11. Worker uploads to YouTube.
12. Worker uploads to Instagram.
13. Worker writes upload attempts.
14. n8n schedules verification.
15. Worker verifies upload status.
16. Success -> delete Drive file.
17. Failure after retry -> needs_manual_review.
```

## State machine

### Main job status

```text
queued
locked
validating
downloading
downloaded
processing
processed
staging_to_drive
ready_to_upload
uploading_youtube
uploading_instagram
awaiting_verification
completed
failed
needs_manual_review
deleted_from_drive
```

### Upload status per platform

```text
pending
uploading
uploaded
verification_pending
verified
failed
skipped
login_required
```

## Job locking

A worker must not process the same job twice. Use database locking fields:

```text
locked_by
locked_at
lock_expires_at
```

Lock rules:

- Only jobs with `status = queued` or stale expired locks are claimable.
- Worker sets `locked_by` to a unique worker ID.
- Worker sets `lock_expires_at` to now + safe timeout.
- Worker periodically extends lock for long jobs.
- If worker crashes, a recovery workflow can release stale locks.

## Queue strategy for MVP host

Recommended MVP settings:

```text
QUEUE_POLL_INTERVAL_SECONDS=120
MAX_JOBS_PER_POLL=2
MAX_FFMPEG_CONCURRENCY=1
MAX_DOWNLOAD_CONCURRENCY=2
MAX_UPLOAD_CONCURRENCY_PER_PLATFORM=1
JOB_HARD_TIMEOUT_MINUTES=45
UPLOAD_HARD_TIMEOUT_MINUTES=30
VERIFY_DELAY_MINUTES=30
```

For 4 to 5 videos/day, this is enough. If 8 videos are submitted in a day, the system should queue and process them sequentially.

## Error handling architecture

Every stage must catch errors and write:

```text
stage
error_code
error_message
retryable true/false
raw_error_snippet
created_at
```

Do not only store generic `failed`. The admin needs the reason.

Example errors:

```text
INVALID_URL
UNSUPPORTED_DOMAIN
DOWNLOAD_FAILED
FFMPEG_FAILED
DRIVE_UPLOAD_FAILED
AI_METADATA_FAILED
YOUTUBE_LOGIN_REQUIRED
YOUTUBE_UPLOAD_FAILED
INSTAGRAM_LOGIN_REQUIRED
INSTAGRAM_UPLOAD_FAILED
VERIFICATION_FAILED
DRIVE_DELETE_FAILED
```

## Manual recovery architecture

Manual recovery must not require database editing.

Admin dashboard actions:

- Retry upload.
- Retry processing from source URL.
- Delete Drive file.
- Mark ignored.
- Mark account login recovered.
- Open source URL.
- Open Drive file.

## Scaling path

### Stage 1: MVP

- Vercel.
- Supabase free tier.
- Single n8n instance.
- Single worker container.
- Playwright uploaders.
- Google Drive staging.

### Stage 2: Stabilization

- Add Redis.
- Move n8n to queue mode.
- Add worker health dashboard.
- Add job lock recovery.
- Add external error alerts.

### Stage 3: API migration

- Add YouTube API uploader adapter if app verification and quota make sense.
- Add Instagram Graph API uploader adapter for professional accounts if setup is approved.
- Keep Playwright as fallback or remove it.

### Stage 4: Client expansion

- Add client/source owner records.
- Add permissions by client.
- Add scheduled upload windows.
- Add metrics per account and content type.

## Architecture decisions

### ADR-1: Google Drive as staging storage

Decision: Use Google Drive because the operator already has 2 TB storage.

Consequences:

- Low cost.
- Requires Drive API integration.
- Not ideal as hot object storage.
- Supabase must still store metadata and state.

### ADR-2: Playwright uploaders for MVP

Decision: Use Playwright because official platform upload APIs introduce setup, quota, verification, or professional-account friction.

Consequences:

- Faster MVP.
- More fragile than official APIs.
- Requires persistent session management.
- Requires manual login recovery.

### ADR-3: Worker service outside n8n

Decision: Use worker service for heavy jobs.

Consequences:

- Cleaner n8n workflows.
- Easier testing in Cursor.
- Better control over Docker resource limits.
- Easier future replacement of modules.

## Implementation boundaries

### Browser-facing boundary

Browser can access:

- Vercel routes.
- Supabase publishable/anon key subject to RLS.

Browser cannot access:

- Service role key.
- Worker token.
- Platform credentials.
- Google Drive service credentials.
- n8n secrets.

### Server-facing boundary

Vercel server routes can:

- Validate submissions.
- Create jobs.
- Read admin data after auth checks.

Worker can:

- Use service role key.
- Use Drive credentials.
- Use AI provider key.
- Use Playwright profiles.

## Observability architecture

Minimum logs:

```text
job_events
upload_attempts
audit_logs
worker_logs local file
n8n execution history
```

Dashboard should summarize:

- Queued jobs.
- Active jobs.
- Completed today.
- Failed today.
- Login-required accounts.
- Drive files waiting for cleanup.

## Production-readiness checklist

- RLS enabled on public tables.
- Service role key only on worker/server contexts (never in browser bundle).
- Worker token configured.
- Docker restart policies configured.
- Temp cleanup cron configured.
- FFmpeg concurrency locked to 1.
- Playwright profiles isolated per account.
- Admin dashboard actions audit logged.
- Drive deletion tested.
- Failed job retry tested.
- Account login-required flow tested.
- Backup/export of Supabase schema created.

## Finalized niche routing architecture

The MVP niche list is now finalized as:

| Niche | YouTube target | Instagram target | Selection method | Notes |
|---|---|---|---|---|
| Memes | One mapped YouTube account | One mapped Instagram account | Submitter selects `Memes` | Short humor, trends, relatable clips, creator-approved meme content. |
| Anime | One mapped YouTube account | One mapped Instagram account | Submitter selects `Anime` | Anime edits, commentary, anime-related short clips, creator-approved source content. |
| Sports | One mapped YouTube account | One mapped Instagram account | Submitter selects `Sports` | Sports highlights/commentary-style clips where the agency has permission to republish. |

Rules:

1. Every niche maps to exactly one YouTube account and exactly one Instagram account.
2. Submitters do not manually choose platform accounts.
3. The selected niche resolves the target accounts.
4. The same processed video is uploaded to both the mapped YouTube account and the mapped Instagram account.
5. No AI niche classification is used in MVP. The submitter is responsible for selecting the correct niche.
6. If the niche is wrong, the job must be corrected from the admin dashboard before processing, or manually fixed before retry.

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
