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

While running, the worker also upserts `system_settings.worker_heartbeat` every ~20s
(`at`, `ok`, Drive/upload flags, host). The hosted admin topbar reads that row to show
Remote Laptop offline / ready / degraded — it never calls the private worker URL.

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
- Skip claim while the Instagram collector hold is on (current job is never aborted).

## Instagram collector (same worker process)

Enabled only when `COLLECTOR_ENABLED=true` on the laptop. On worker start and every `COLLECTOR_INTERVAL_MS` (default 3 hours):

1. Set claim hold so n8n cannot lock a new queued job.
2. Wait until FFmpeg/upload queues are empty and no in-flight / ready-to-upload job remains.
3. Open the dedicated `ig-collector` Playwright profile (never a niche upload profile).
4. Open `/direct/t/{id}/` for `COLLECTOR_THREAD_IDS` (and the inbox list only when those ids are unset). Dismiss sleep-mode / notification / 2FA-upsell dialogs the same way Studio banners are dismissed — never enter a 2FA code. Collect every reel preview in the message pane, pairing the niche word in the following text bubble (`Anime` / `Sport` / `Meme`). Never harvest profile-grid HTML or concatenated shortcodes.

5. Close Chrome, clear hold, resume the queue.

Rules:

- Prefer permalinks from the open `/direct/t/` thread (preview card href, overlay, or `/reel/{11-char}/` request URLs after a click). Scroll older messages in each chat and open every reel preview — not only the latest visible card. Pair each reel with the short text bubble under that card (`Anime` / `Sport` / `Meme`); do not steal the first `/reel/` link elsewhere on the page. Persist rejects concatenated junk and anything not taken from a Direct thread. All senders trusted. URL allowlist still rejects TikTok/localhost/etc.
- One niche word per reel (the bubble under that preview). Whole-thread text with both `anime` and `sports` is not used — that would look ambiguous.
- Soft Instagram dialogs (sleep mode OK, Not Now, Dismiss, Skip on security upsells) must not stop the collector. Real login/2FA/CAPTCHA: fail the collector pass only, set `loginRequired` on heartbeat, never bypass.
- Collector scrape failure must not crash the worker process.
- While collector Chrome is open, `runUpload` / `retryJob` defer instead of overlapping profiles.

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
Speed: 1.2x
Watermark: none on Instagram export
YouTube c-text: if source has no burned-in hard captions, burn niche brand
  (anime=ShonenSnaps, memes=CrackleCrumb, sports=ScoreMorsel) with smooth
  pulsing opacity 60%↔20% on the graphical content area before YT upload;
  if hard captions already present, upload shared export unchanged
Visual filter: stronger eq (saturation≈1.75, contrast≈1.4; ~7–8× prior mild deltas)
Geometry: force 1080x1920 (9:16) via scale+center-crop so YouTube treats the
  upload as a Short and Instagram Reels stay vertical (landscape sources are
  cover-cropped; already-vertical reels stay full-bleed)
Audio: original track tempo-matched + background music mixed at 30% volume (original kept)
Output: MP4/H.264/AAC (yuv420p)
```

Background music asset: `apps/worker/assets/bgm/absolutesound-background-guitar-no-copyright-561871.mp3`.
Override with `BACKGROUND_MUSIC_PATH`.

### Conceptual FFmpeg flow

```text
input video + background music
  -> setpts for 1.2x video speed + stronger visual eq
  -> scale/crop to 1080x1920 (9:16 Shorts/Reels)
  -> atempo for 1.2x original audio (when present)
  -> volume=0.3 on background music
  -> amix original + BGM (duration=first, normalize=0)
  -> encode H.264/AAC (yuv420p)
  -> assert output is exactly 1080x1920
shared output (Drive / Instagram)

YouTube upload path only:
  -> detect burned-in hard captions (c-text) on shared export
  -> if absent: drawtext niche brand with alpha='0.4+0.2*cos(2*PI*t/10)'
  -> if present: use shared export as-is
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

```text
Primary: Google Gemini 3.5 Flash (@google/genai)
Fallback: Groq OpenAI-compatible API (llama-3.3-70b-versatile by default)
Optional: OpenRouter
Safe fallback: cleaned source caption/title + niche tags (never crash the worker)
```

One request produces YouTube title, YouTube description, Instagram caption, keywords, and hashtag lists.

Downloader writes `--write-info-json` and passes title/description into metadata generation.
Optional transcript / creator notes / account style fields are supported when available.

### Inputs

```text
source_url
source_platform
niche
source title / caption from yt-dlp info.json
optional transcript, creator notes, account name/style
```

### Outputs

```text
youtube_title
youtube_description
instagram_caption
keywords / instagramHashtags / youtubeHashtags (logged; captions also include hashtags)
provider + model for audit
```

### Requirements

- Use only details supported by supplied context; never invent facts.
- Metadata must describe the **clip** (caption / on-screen subject). Never ship pipeline/product boilerplate (“publishing lane”, “originally submitted”, “metadata stays conservative”, Project AP-I internals).
- Prefer IG/YT caption body over weak yt-dlp titles like `Video by username`.
- Preferred lengths: YT title ~45–85 chars; YT description ~750–1,600 unique paragraphs (no repeated filler); IG caption ~420–1,200 (memes may be punchier).
- Unrelated scraped source text (wrong-language gossip, multi-@ spam) is ignored so titles stay niche-relevant. Long non-junk captions are kept even without niche keywords.
- Hard caps: title ≤100, description ≤5000, IG caption ≤2200.
- Delimit untrusted source text so it cannot override system instructions.
- Do not include internal job IDs or secrets.

### Failure behavior

If metadata generation fails:

- Prefer length-compliant fallbacks built from cleaned source **caption** (not weak “Video by …” titles) + niche-safe structure about the clip (must pass the same length floors as AI output).
- Mark `metadata_status = fallback_used`.
- Continue upload unless admin config says metadata is mandatory.
- Pipeline re-asserts quality before persisting; short stubs and pipeline boilerplate never ship as `generated`.

### Stale pipeline recovery

`recoverStalePipelineJobs` requeues mid-pipeline jobs (`downloading`…`staging_to_drive`, locked `ready_to_upload`) when the lock expired or there is no progress for `PIPELINE_STALE_THRESHOLD_MS`. Repeated stalls escalate to `failed` / `PIPELINE_STALE`.

### Admin abort / pause

Hosted admin sets `paused` or `cancelled` in Supabase and may enqueue `admin_commands.command = abort_job`. The worker clears locks, fails in-flight upload attempts, and cooperative checks between stages stop Playwright without re-publishing. Unpause returns the job to `queued` with `created_at = now()` (end of FIFO).

## Upload modules

### Daily upload limit (per account)

Each YouTube and Instagram `platform_accounts` row may publish at most **5** successful uploads per **rolling 24-hour window** (`DAILY_UPLOAD_LIMIT_PER_ACCOUNT`, default `5`).

### YouTube duplicate-upload guard

Root cause of niche-account spam loops: Playwright clicked YouTube Publish but failed to capture the share URL, the failure was treated as **transient**, and WF-08/verify scheduled full re-uploads while Instagram stayed `uploaded`.

Guards now in place:
- After Publish, the uploader resolves a real public URL from Studio `/video/<id>` URLs, share dialog anchors/inputs, page HTML, Share/Copy-link controls, clipboard, and Studio content-list title match.
- Captured Studio ids are normalized to `https://youtu.be/<id>` before success is recorded.
- Capture miss uses `YOUTUBE_URL_CAPTURE_FAILED` (not a generic publish failure) and is **not** transient (no in-process re-publish).
- `UploadCoordinator` skips Playwright when a successful `upload_attempts` row already has a real platform URL.
- `platformsNeedingUpload()` never forces a platform that is already `uploaded`/`verified`.
- `runUpload` does not fall back to uploading both platforms when both already succeeded.
- Verify parks publish-without-URL cases to `needs_manual_review` instead of auto-retry.

Admin can **cancel** or **pause** jobs from the dashboard (`cancelled` / `paused`) and enqueue `abort_job` so the local worker stops in-flight Playwright.

- Counted from distinct successful `upload_attempts` (`status=uploaded`) with `finished_at` in the last 24 hours, plus in-flight `uploading` jobs for that account.
- When a niche’s needed account is at the cap:
  - New jobs stay **`queued`** (claim is released).
  - Already-processed jobs stay **`ready_to_upload`** (no Playwright attempt, no retry loop).
- If YouTube returns “daily upload limit reached”, the job is parked the same way instead of failing into verify→retry loops.
- Slots free as older uploads age out of the 24h window (not UTC midnight).
- Admin **Force** (Ship's log Retries column) sets `jobs.force_upload_override` for one job so claim/upload skip the soft cap once; YouTube/Instagram hard caps still apply.

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

Verification runs around 5 minutes after upload.

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
- FFmpeg output created with 1.2x speed, stronger filter, forced 1080x1920 vertical, and quiet BGM mix (no IG watermark). YouTube may receive an additional niche brand c-text overlay when hard captions are absent.
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
