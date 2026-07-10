---
subtitle: "Backend and Worker Specification"
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

# Backend and Worker Specification

## Document control

| Field | Value |
|---|---|
| Project name | Project AP-I |
| Developer | Atharva (Techno) |
| Document | Backend and Worker Specification |
| Version | 1.1 |
| Backend target | Docker worker on local machine (MVP); optional remote VPS later |

## Backend responsibility split

Project AP-I has two backend areas:

1. Vercel server routes/server actions for web-facing operations.
2. Local worker service (Docker or native Node) for heavy processing and uploads.

The Vercel/local web backend should stay lightweight. The worker is responsible for the end-to-end media pipeline.

## Vercel backend responsibilities

- Authenticate user through Supabase.
- Validate submission form.
- Insert job into Supabase.
- Enforce admin-only dashboard actions.
- Call internal worker endpoints only from server-side code when required.

Vercel must not:

- Run FFmpeg.
- Run yt-dlp.
- Run Playwright uploads.
- Store browser profiles.

## Worker service responsibilities

The worker service handles:

- Claiming jobs.
- Processing jobs.
- Retrying uploads.
- Verifying uploads.
- Deleting Drive files.
- Recording logs.

## Worker API endpoints

All worker endpoints require an internal token header:

```text
X-Worker-Token: <strong secret>
```

### Health

```text
GET /health
```

Response:

```json
{
  "ok": true,
  "version": "1.0.0",
  "ffmpeg": true,
  "ytDlp": true,
  "playwright": true
}
```

### Claim/process next job

```text
POST /jobs/process-next
```

Behavior:

- Claims one queued job.
- Processes it through the pipeline.
- Returns job ID and result.

### Process specific job

```text
POST /jobs/:id/process
```

Used by n8n or admin retry.

### Retry upload

```text
POST /jobs/:id/retry-upload
```

Does not redownload or reprocess unless staged file is missing.

### Verify upload

```text
POST /jobs/:id/verify
```

Runs verification for one job.

### Delete Drive file

```text
POST /jobs/:id/delete-drive-file
```

Admin action routed through backend/worker. Requires job to be failed/manual review or completed cleanup state.

### Process next admin command (outbox)

```text
POST /admin-commands/process-next
```

Used by local n8n (WF-07) while the hosted admin UI cannot reach the private worker. Claims one pending `admin_commands` row and runs retry-upload or delete-drive-file locally.

## Job processing sequence

```text
claimJob
validateJob
resolveNicheMapping
downloadSource
processVideo
uploadToDrive
generateMetadata
uploadToYouTube
uploadToInstagram
scheduleVerification
```

The sequence must be stage-aware so a retry can resume from the correct point.

## Claim job logic

Pseudo-logic:

```ts
async function claimNextJob(workerId) {
  const job = await db.rpc('claim_next_job', {
    worker_id: workerId,
    lock_minutes: 45
  })
  return job
}
```

Database RPC should atomically select and lock one job.

Rules:

- Only claim jobs with `status = queued`.
- Do not claim jobs with `needs_manual_review`.
- Do not claim jobs for paused account mappings.
- Recover stale locks separately.

## URL validation in worker

Never trust only frontend validation.

Worker checks:

- URL parses correctly.
- Hostname is allowed.
- URL does not resolve to localhost/private IP if any server fetch follows redirects.
- Platform matches submitted platform or records warning.
- Only `youtube`, `instagram` are accepted.

Allowed hosts:

```text
instagram.com
www.instagram.com
youtube.com
www.youtube.com
m.youtube.com
youtu.be
```

## Download module

### Tool

Use yt-dlp.

### Inputs

```text
source_url
job_id
temp_dir
source_platform
```

### Outputs

```text
local_source_path
source_metadata optional
duration optional
channel_name optional if available
```

### Command strategy

Use safe subprocess execution with argument arrays, not string interpolation.

Example shape:

```ts
execa('yt-dlp', [
  '--no-playlist',
  '--restrict-filenames',
  '-f', 'mp4/best',
  '-o', outputTemplate,
  sourceUrl
])
```

Avoid passing untrusted input into shell strings.

### Download restrictions

MVP limits:

```text
Max duration: 180 seconds
Max file size: 500 MB
Playlist disabled
One URL per job
```

## FFmpeg processing module

### Processing preset

```text
Speed: 1.1x
Watermark: niche-specific logo (memes / anime / sports), bottom-right, 70 percent opacity, small size
Visual filter: mild standardization
Audio: tempo adjusted to match speed
Output: MP4/H.264/AAC
```

Watermark assets live at `apps/worker/assets/watermarks/{memes,anime,sports}.png`.
Optional override: `WATERMARKS_DIR`. Fallback: `WATERMARK_PATH` if a niche file is missing.

### Conceptual FFmpeg flow

```text
input video
  -> setpts for video speed
  -> atempo for audio speed
  -> scale watermark
  -> apply watermark opacity
  -> overlay bottom-right
  -> encode H.264/AAC
output video
```

### Output naming

```text
job_<jobId>_edited.mp4
```

### Temp folder structure

```text
/tmp/jobs/<jobId>/
  source.ext
  edited.mp4
  logs.txt
```

### Cleanup rules

- Delete temp folder after successful Drive upload.
- Delete temp folder after failure unless debugging mode is enabled.
- Never delete Drive file unless success cleanup or admin action requires it.

## Google Drive storage module

### Responsibilities

- Upload edited video to Drive.
- Return Drive file ID and view/download link.
- Move failed files to failed folder if needed.
- Delete Drive file after successful upload verification.

### Upload type

Use resumable uploads for video files.

### Folder mapping

```text
processed_ready_folder_id
failed_manual_review_folder_id
```

### File naming

```text
AP-I_<nicheSlug>_<jobId>_<yyyyMMdd_HHmm>.mp4
```

## AI metadata module

### Inputs

```text
source_url
source_platform
niche
source title from yt-dlp info.json (when available)
source caption/description from yt-dlp info.json (when available)
optional source channel/uploader
```

Downloader writes `--write-info-json` and passes title/description into metadata generation.

### Outputs

```text
youtube_title
youtube_description
instagram_caption
hashtags optional
```

### Requirements

- Prefer rephrasing the original source caption/description (title as backup).
- Keep the same topic/meaning; do not invent unrelated copy.
- Add 3–5 niche hashtags on YouTube description and Instagram caption.
- Keep YouTube title concise (max ~70 chars preferred).
- Avoid fake claims.
- Avoid misleading health/finance/legal claims if relevant.
- Avoid spam-like hashtags.
- Do not include internal job IDs.
- Strip source promo CTAs, @mentions, and external URLs when rewriting.
- Generate in the target language style configured later.

### Failure behavior

If metadata generation fails:

- Prefer lightly cleaned original source caption/title + niche tags.
- Otherwise use niche fallback template.
- Mark `metadata_status = fallback_used`.
- Continue upload unless admin config says metadata is mandatory.

Fallback example (no source text):

```text
Title: Latest update in <niche>
Description: Watch this short update. Posted through Project AP-I.
Instagram caption: New short update. #shorts #reels
```

## Upload modules

### Common uploader interface

```ts
type UploadInput = {
  job: Job
  filePathOrDriveDownloadUrl: string
  metadata: PlatformMetadata
  account: PlatformAccount
}

type UploadResult = {
  success: boolean
  platformMediaId?: string
  platformUrl?: string
  errorCode?: string
  errorMessage?: string
  loginRequired?: boolean
}
```

### YouTube Playwright uploader

Responsibilities:

- Open persistent browser profile for target YouTube account.
- Navigate to upload page.
- Upload edited file.
- Fill title and description.
- Publish according to available UI.
- Capture resulting status/URL if available.

Must not:

- Bypass CAPTCHA.
- Bypass 2FA.
- Use stealth evasion plugins.

If login or challenge appears:

```text
set account.login_required = true
set youtube_upload_status = login_required
mark job needs_manual_review or retryable_after_login
```

### Instagram Playwright uploader

Responsibilities:

- Open persistent browser profile for target Instagram account.
- Snapshot the newest profile reel/post URL **before** create (baseline).
- Navigate to creation/upload flow.
- Upload edited file.
- Fill caption.
- Publish (Share).
- Confirm success only with a **real** Instagram media URL (`/reel/`, `/p/`, or `/tv/`):
  - Prefer Share-dialog / “See post” link when present.
  - Otherwise require the profile’s newest media URL to **differ from the baseline**.
- Never invent synthetic `ig-<jobId>-<timestamp>` media IDs. Missing confirmation = upload failed.

Same login challenge rules apply.

Verification also rejects synthetic `ig-` / `yt-` placeholders and requires real YouTube/Instagram URLs before marking verified / deleting Drive.

## Verification module

Verification runs around 30 minutes after upload.

Inputs:

```text
job_id
youtube_upload_attempt_id
instagram_upload_attempt_id
```

Checks:

- Upload attempt had success marker.
- Platform media URL or ID exists if captured.
- Optional account content list confirms recent post.

If uncertain:

```text
verification_status = uncertain
```

Do not delete Drive file on uncertain verification. Admin can later decide.

## Retry logic

### Download retry

```text
Max attempts: 2
Retry delay: 5 minutes
```

### Processing retry

```text
Max attempts: 1 or 2
```

### Upload retry

```text
Max attempts per platform: 2
Retry upload only
```

### Drive delete retry

```text
Max attempts: 3
If delete fails, mark drive_cleanup_failed
```

## Concurrency control

Use `p-limit` or a simple in-process queue.

MVP hard rules:

```text
Only one active FFmpeg process.
Only one active YouTube upload.
Only one active Instagram upload.
```

If multiple worker instances are added later, concurrency must be controlled at database/queue level, not only in memory.

## Resource protection

Before starting processing, check:

```text
available disk space > 20 GB
active ffmpeg jobs < 1
job file size below configured limit
```

If not safe:

```text
status = queued
failure_reason = RESOURCE_LIMIT_WAIT
```

or pause queue processing.

## Logging

Use structured logs.

Example:

```json
{
  "level": "info",
  "jobId": "...",
  "stage": "processing",
  "event": "ffmpeg_started",
  "time": "2026-06-28T10:15:00Z"
}
```

Write to:

- Local worker logs.
- `job_events` table for important events.
- `audit_logs` for user/admin actions.

## Backend acceptance checklist

- Worker health endpoint reports dependencies.
- Worker can claim one queued job.
- Worker cannot claim same job twice.
- Invalid URL fails safely.
- yt-dlp download success updates DB.
- FFmpeg output created with watermark.
- Local temp files are deleted after Drive upload.
- Drive file ID is stored.
- Metadata generation updates job.
- YouTube upload attempt is recorded.
- Instagram upload attempt is recorded.
- Verification does not delete Drive file unless both platforms succeed.
- Failed twice -> needs manual review.
- Admin delete removes Drive file and logs action.

## Finalized niche mapping logic - Version 1.1

The worker must resolve the target accounts from Supabase, never from frontend input beyond the `niche_id`.

Required behavior:

```text
Input job.niche_id
↓
Query active platform_accounts for that niche
↓
Require exactly one active YouTube account
↓
Require exactly one active Instagram account
↓
Upload processed file to both accounts
```

If account mapping is missing or duplicated, the worker must fail safely:

```text
status = needs_manual_review
failure_reason = niche_account_mapping_invalid
```

The worker must not guess the account. It must not upload to a default account.

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
