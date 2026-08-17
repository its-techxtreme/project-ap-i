---
subtitle: "Product Requirements Document"
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

# Product Requirements Document

## Document control

| Field | Value |
|---|---|
| Project name | Project AP-I |
| Developer | Atharva (Techno) |
| Document | Product Requirements Document |
| Version | 1.1 |
| Status | Build-ready MVP specification |
| Target deployment | Local machine (MVP) + Supabase cloud + Google Drive; optional Vercel/VPS later |

## Executive summary

Project AP-I is a client-approved short-form content intake, processing, and republishing system. It lets trusted submitters paste approved Instagram Reel or YouTube Shorts links into a secure web page, choose a niche, confirm rights permission, and submit the content into a Supabase-backed job queue. The system then processes each queued job through an n8n-orchestrated worker pipeline running on the **local developer machine** (Docker: worker + n8n). Remote VPS hosting is deferred for MVP.

The MVP must download or retrieve approved content, apply a standardized republishing preset, upload a staged edited file to Google Drive, generate platform-specific metadata, and publish the content to the niche-mapped YouTube and Instagram accounts. After publishing, a verification workflow checks the result. If both uploads succeed, the staged Google Drive file is deleted. If upload fails twice, the file remains in Google Drive for manual review and cleanup from the admin dashboard.

This product is not designed for random scraping or unauthorized reposting. Every submission must be backed by the submitter's rights confirmation. The system records that confirmation for auditability.

## Problem statement

The agency needs a low-cost way to test a content growth model for a few clients across three finalized niches. Manual reposting across multiple accounts is repetitive and error-prone. The current manual workflow also has weak tracking: it is difficult to know who submitted a link, whether it was processed, whether it uploaded successfully to both platforms, why a job failed, and whether Drive storage has been cleaned.

Project AP-I solves this by turning every submitted link into a tracked job with statuses, retries, logs, account mapping, and dashboard visibility.

## Goals

### Product goals

1. Accept approved YouTube Shorts and Instagram Reel links from trusted submitters.
2. Require submitters to confirm that rights and permissions are available before submission.
3. Route each submission by manually selected niche.
4. Map each niche to exactly one YouTube account and one Instagram account.
5. Process each video using a fixed MVP edit preset: 1.2x speed, stronger visual filter, forced 1080×1920 (9:16) vertical output, original audio retained, and a background music bed mixed at 30% volume (no burned-in watermark on the Instagram export). For YouTube only: if the reel has no existing burned-in hard captions (c-text), burn niche brand c-text (anime=`ShonenSnaps`, memes=`CrackleCrumb`, sports=`ScoreMorsel`) with pulsing 60%↔20% opacity on the graphical content area before upload; if c-text is already present, upload the shared edit export unchanged.
6. Generate YouTube title, YouTube description, and Instagram caption using a configured AI model provider.
7. Upload each processed video to both platforms.
8. Verify upload success around 5 minutes after upload.
9. Delete successfully uploaded staged files from Google Drive.
10. Keep twice-failed files in Drive until manual cleanup.
11. Provide an admin dashboard for status, failures, retry, and deletion.

### Engineering goals

1. Keep recurring cost close to zero by using existing Supabase, Google Drive, and local compute resources.
2. Avoid heavy processing inside n8n. n8n should orchestrate, while a Docker worker performs download, FFmpeg, Drive, and Playwright tasks.
3. Keep host machine load controlled with concurrency limits (`MAX_FFMPEG_CONCURRENCY=1`).
4. Make the upload layer swappable so Playwright can be replaced by official APIs later.
5. Use Supabase as the source of truth for job state, not Google Drive.
6. Design database tables for auditability from day one.
7. Keep secrets out of the frontend.

## Non-goals

1. No public random-user upload portal without controls.
   Product update: anonymous public submit is allowed on `/` with IP rate limiting,
   URL allowlist validation, and server-side service-role insert. Admin remains fully authenticated.
2. No support for unsupported domains beyond YouTube and Instagram in MVP.
3. No automatic AI niche classification in MVP.
4. No burned-in subtitles or captions.
5. No client/source-owner field in the submission form.
6. No scheduling calendar in MVP. Upload should start as soon as possible after submission.
7. No attempt to automate CAPTCHA or 2FA challenges. Login issues should move an account/job to manual recovery.
8. No direct permanent storage of video files in Supabase Storage for MVP.
9. No importing the existing Excel mapping table in MVP.

## User roles

### Submitter

Trusted friend, employee, or worker who regularly discovers or receives approved client links.

Submitter can:

- Sign in.
- Paste a URL.
- Confirm or edit detected platform.
- Choose niche from a dropdown.
- Confirm rights permission.
- Submit the job.
- Optionally see their own recent submissions if enabled.

Submitter cannot:

- View all jobs.
- Edit niche-account mappings.
- See credentials.
- Retry failed jobs.
- Delete Drive files.

### Admin

Project owner/operator.

Admin can:

- View all jobs.
- View job statuses and failure reasons.
- Retry failed upload attempts.
- Delete selected failed Drive files.
- Manage niches.
- Manage account mappings.
- Mark account sessions as login-required or recovered.
- View audit logs.

### Worker service

Backend service running on the local machine (Docker worker). It is not a human user.

Worker can:

- Read queued jobs.
- Lock a job for processing.
- Update statuses.
- Write Drive file IDs.
- Run video processing.
- Trigger uploads.
- Record upload attempts.

Worker must authenticate with a server-side secret and must not use browser-exposed credentials.

## Primary user journey

1. Submitter opens the Project AP-I submission page.
2. Submitter logs in or accesses an authenticated route.
3. Submitter pastes a YouTube Shorts or Instagram Reel link.
4. Frontend auto-detects platform.
5. Submitter selects niche.
6. Submitter checks rights confirmation.
7. Submitter submits.
8. Supabase creates a job with status `queued`.
9. n8n or a webhook-triggered workflow picks up the queued job.
10. Worker downloads the approved source video into a temporary local folder.
11. Worker applies the FFmpeg edit preset.
12. Worker uploads the edited file to Google Drive.
13. AI metadata generation creates the YouTube title, YouTube description, and Instagram caption.
14. Upload worker posts to the niche-mapped YouTube and Instagram accounts through Playwright MVP.
15. Supabase records upload attempt IDs, timestamps, results, and failure reasons.
16. Verification workflow checks both uploads after roughly 5 minutes.
17. If both uploads succeeded, the worker deletes the edited staged Drive file and marks the job `completed`.
18. If upload fails twice, the job becomes `needs_manual_review`, and the Drive file remains available.
19. Admin reviews failed jobs and can retry or delete files.

Trusted crew can also DM a dedicated collector Instagram account. The same worker, on start and every 3 hours, waits for the current pipeline job to finish (it never aborts mid-flight), then scrapes recent Direct threads (including already-read chats). A reel plus a niche word (`anime`, `memes`/`meme`, `sports`/`sport`) becomes a queued job with rights assumed. Reels without a niche stay in Unsorted cargo until an admin watches them and confirms a niche. All senders are trusted; unsupported URLs are still rejected.

## MVP scope

### Must have

- Secure login.
- Submission form with URL, platform, niche, rights checkbox, and submit button.
- Auto-detect platform from URL.
- URL allowlist for YouTube and Instagram only.
- Supabase database schema.
- Job queue state machine.
- n8n orchestration.
- Worker service (local Docker or native Node).
- yt-dlp based download layer with failure handling.
- FFmpeg processing preset (1.2x speed, stronger filter, forced 1080×1920 vertical, quiet BGM bed; YT brand c-text when no hard captions).
- Google Drive upload and deletion.
- AI title/description/caption generation.
- Playwright YouTube upload.
- Playwright Instagram upload.
- Instagram collector DMs (same worker, dedicated collector profile).
- Upload verification workflow.
- Failed job dashboard.
- Manual retry button.
- Manual delete selected failed Drive files.
- Audit log table.

### Should have

- Account health tab.
- Login-required indicator.
- Duplicate link detection.
- Submission rate limits.
- Admin-only settings page for niche-account mappings.
- Basic error notifications via email, Telegram, or Discord.

### Could have

- Queue mode for n8n with Redis.
- Official API uploader adapters.
- AI rewrite variants.
- Client/source owner field.
- Manual approval flow.
- Automatic Drive cleanup policy for old failed jobs.
- Analytics and performance dashboard.

### Will not have in MVP

- Direct browser-based file uploads.
- Video preview editor.
- Bulk CSV import.
- Multi-account random rotation.
- AI video analysis.
- Stealth browser evasion.
- CAPTCHA bypassing.

## Functional requirements

### FR-1: URL submission

The system shall allow authenticated submitters to submit a YouTube or Instagram URL. The frontend shall validate the URL format before submission, and the backend shall repeat validation server-side.

Acceptance criteria:

- Invalid domains are rejected.
- Empty URLs are rejected.
- Shortened random URLs are rejected unless they are `youtu.be`.
- User cannot submit without a niche.
- User cannot submit without rights confirmation.

### FR-2: Platform detection

The system shall detect source platform from the URL.

Rules:

```text
instagram.com/reel/... -> instagram
youtube.com/shorts/... -> youtube
youtu.be/... -> youtube
youtube.com/watch?v=... -> youtube, but marked as non-short-format-warning if needed
```

The platform field remains editable between only two values: `youtube` and `instagram`.

### FR-3: Niche mapping

Each niche maps to exactly one YouTube account and one Instagram account. Submitters only select niche. They do not manually choose accounts.

Acceptance criteria:

- Admin can configure niche name and mapped account IDs.
- If a niche does not have both accounts configured, submission or processing must fail with a clear admin-visible error.

### FR-4: Job creation

Every successful submission creates a row in `jobs` with `status = queued`, `rights_confirmed = true`, and default upload statuses set to `pending`.

### FR-5: Queue handling

The worker shall process queued jobs in a safe order. The MVP should process one FFmpeg job at a time on the dev host machine.

Recommended limits:

```text
max_ffmpeg_jobs = 1
max_active_downloads = 2
max_drive_uploads = 1
max_youtube_uploads = 1
max_instagram_uploads = 1
max_jobs_locked_per_poll = 2
```

### FR-6: Processing preset

The system shall apply a fixed video preset:

```text
speed: 1.2x
watermark: none on Instagram export
youtube_ctext: if no burned-in hard captions on the reel, burn niche brand
  (anime=ShonenSnaps, memes=CrackleCrumb, sports=ScoreMorsel) with smooth
  pulsing opacity 60%↔20% (10s cosine cycle) on the graphical content area;
  if hard captions already present, upload shared export to YouTube as-is
filter: stronger standardized visual filter (~7–8× prior mild eq deltas)
audio: original soundtrack tempo-matched + background music bed at 30% volume
format: MP4/H.264
no burned subtitles required (Instagram caption = post text, not on-video)
```

Background music lives at `apps/worker/assets/bgm/` (override with `BACKGROUND_MUSIC_PATH`).

### FR-7: Metadata generation

The system shall generate:

- YouTube title.
- YouTube description.
- Instagram caption.

The generation prompt must instruct the model to avoid fake claims, spammy guarantees, and misinformation.

### FR-8: Dual upload

Every processed job shall upload to both the mapped YouTube account and the mapped Instagram account.

### FR-9: Verification

The system shall verify upload success around 5 minutes after upload.

Verification can use:

- Page confirmation from Playwright flow.
- Visible uploaded media URL/ID where available.
- Account page/library check where feasible.
- Stored upload result from platform UI.

### FR-10: Retry behavior

If upload fails once, the system retries upload only. It must not redownload or reprocess unless the edited Drive file is missing or corrupt.

If upload fails twice, the job becomes `needs_manual_review`.

### FR-11: Drive cleanup

If both platform uploads succeed, the staged edited Drive file shall be deleted. If a job fails twice, the file remains in Drive until admin deletion.

### FR-12: Admin failure cleanup

Admin dashboard shall allow selecting failed jobs and deleting their Drive files. Deletion action must be audit logged.

## Non-functional requirements

### Reliability

- Jobs should be idempotent where possible.
- Worker should recover from restart without corrupting job state.
- Long-running jobs should have stale lock recovery.
- Failed jobs should preserve detailed failure reasons.

### Security

- Supabase service role key must never appear in frontend code.
- All exposed tables must use RLS.
- Admin routes must enforce admin role server-side.
- URLs must be allowlisted and normalized.
- Worker APIs must require a strong internal token.
- Credentials should live in n8n credentials, local `.env` (never committed), or encrypted secret storage.

### Performance

- 4 to 5 videos per day must complete without manual intervention under normal conditions.
- One exceptional day with 8 videos must queue safely without overloading the host machine.
- A single video should not monopolize the worker forever; job timeouts are required.

### Cost

- MVP should use existing Supabase, Google Drive, and local compute resources.
- No paid storage or paid API dependency is required for MVP.

### Maintainability

- Uploaders must be modular.
- Playwright uploaders must be replaceable by official API uploaders later.
- Configuration should be database-driven for niches and account mappings.
- Logs should be readable by a human admin.

## Success metrics

### MVP success

- 95 percent of approved submissions become processed jobs without manual developer intervention.
- At least 4 videos/day across all accounts can be processed and uploaded.
- Successful jobs clean up Drive files automatically.
- Failed jobs are visible in admin dashboard with actionable reasons.
- Account login failures do not crash the whole system.

### Business success

- The system saves manual upload time.
- The agency can demonstrate a repeatable content growth workflow to clients.
- The system can support three finalized niches with one YouTube and one Instagram account each.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---:|---|
| Playwright upload breaks due to UI change | High | Modular uploaders, manual recovery, clear failures |
| Session expires | High | Persistent profiles, account health dashboard, manual re-login path |
| Host overload | Medium | FFmpeg concurrency = 1, Docker resource limits, job timeouts |
| Drive files accumulate | Medium | Delete on success, failed cleanup UI |
| Bad URL submission | Medium | URL allowlist, backend validation, rights checkbox |
| Supabase key exposure | High | Never expose service role key, strict RLS |
| n8n workflow complexity | Medium | Keep n8n as orchestrator, use worker service for heavy tasks |

## Open decisions

These can be finalized during implementation:

1. Exact niche names.
2. Final list of mapped Instagram and YouTube accounts.
3. AI model provider key and rate limits.
4. Watermark logo file and exact size.
5. Whether submitters can see only confirmation screen or their own job history.
6. Whether notifications go to email, Telegram, Discord, or dashboard only.

## Final product definition

Project AP-I is not just a link saver. It is a controlled job system for client-approved short-form content republishing. The production-grade version must be secure, observable, retryable, and modular enough to upgrade from Playwright to official APIs later without rebuilding the frontend or database.

## Finalized niche model - Version 1.1

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
