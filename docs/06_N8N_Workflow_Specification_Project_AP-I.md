---
subtitle: "n8n Automation Workflow Specification"
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

# n8n Automation Workflow Specification

## Document control

| Field | Value |
|---|---|
| Project name | Project AP-I |
| Developer | Atharva (Techno) |
| Document | n8n Automation Workflow Specification |
| Version | 1.1 |
| n8n role | Orchestrator, scheduler, notification layer |

## n8n design principle

n8n should not become the video engine. It should coordinate reliable steps and call the worker API. Heavy work belongs in the worker.

n8n handles:

- Polling/triggering jobs.
- Calling worker endpoints.
- Scheduling verification.
- Sending notifications.
- Retrying orchestration-level failures.
- Recording high-level results.

n8n does not directly handle:

- FFmpeg processing.
- yt-dlp downloads.
- Playwright browser automation.
- Large binary file handling.

## Workflow overview

Required MVP workflows:

```text
WF-01: New Job Poller
WF-02: Process Job
WF-03: Upload Verification
WF-04: Failed Job Notification optional
WF-05: Manual Retry Webhook
WF-06: Drive Cleanup Webhook
WF-07: Account Health Check optional
```

## WF-01: New Job Poller

### Trigger

Cron every 2 to 5 minutes.

Recommended MVP:

```text
Every 2 minutes during active hours, or every 5 minutes all day.
```

Since the user wants immediate posting, a daily 2:45 PM run is no longer the primary design.

### Purpose

Find queued jobs and hand them to worker safely.

### Steps

```text
1. Cron trigger.
2. Query Supabase for queued jobs count.
3. If no jobs, end.
4. Call worker POST /jobs/process-next.
5. Repeat up to MAX_JOBS_PER_POLL, recommended 2.
6. Log result.
```

### Recommended limits

```text
MAX_JOBS_PER_POLL=2
POLL_INTERVAL=2 minutes
```

This lets the system feel immediate while protecting the local host machine.

## WF-02: Process Job

### Trigger

Can be triggered by WF-01 or manually.

### Worker call

```text
POST {{WORKER_BASE_URL}}/jobs/{{job_id}}/process
Headers:
  X-Worker-Token: {{WORKER_INTERNAL_TOKEN}}
```

### Success branch

If worker returns processed/upload started/completed:

```text
- Save n8n execution ID in job event if needed.
- Schedule verification workflow for 5 minutes later.
```

### Failure branch

If worker returns failure:

```text
- If retryable, leave job status according to worker decision.
- If login_required, notify admin.
- If needs_manual_review, notify admin.
```

## WF-03: Upload Verification

### Trigger

Wait node after process/upload completion or cron query for jobs in `awaiting_verification` where `verification_due_at <= now()`.

Preferred robust design (implemented as **WF-08 Verification Cron**):

```text
Cron every 10 minutes checks jobs due for verification.
```

WF-02 still waits `VERIFY_DELAY_MINUTES` then calls WF-03. WF-08 is the resilience path if n8n restarts mid-wait.

### Steps

```text
1. Cron every 10 minutes.
2. Query jobs where status = awaiting_verification and verification_due_at <= now().
3. For each job, call worker POST /jobs/:id/verify.
4. If verified completed, worker deletes Drive file.
5. If failed/uncertain, worker updates status.
6. Notify admin only for jobs needing manual review.
```

## WF-04: Failed Job Notification

### Trigger

Cron every 15 minutes or after worker response.

### Purpose

Alert admin about important failures without spamming.

Notify when:

```text
job status = needs_manual_review
account login_required = true
Drive cleanup failed
worker health failed
```

Notification targets can be added later:

```text
Email
Telegram
Discord
WhatsApp via approved provider
```

MVP can start with dashboard only.

## WF-05: Manual Retry Webhook

### Trigger

Admin dashboard action calls Vercel API route, which can call n8n webhook or worker directly.

Recommended safer flow:

```text
Admin UI -> Vercel server route -> Worker API
```

n8n is optional for manual retries. If used, webhook should require an internal secret and admin check should happen before calling it.

## WF-06: Drive Cleanup Webhook

### Trigger

Admin selects failed jobs and clicks delete.

Flow:

```text
Admin UI
  -> Vercel server action verifies admin
  -> Worker /jobs/:id/delete-drive-file
  -> Worker deletes Drive file
  -> Supabase audit log
```

n8n can be skipped here.

## Hosted admin outbox (recommended for Vercel)

When the admin dashboard is on Vercel and the worker stays private:

```text
Admin UI (Vercel)
  -> server action verifies admin + job guards
  -> insert admin_commands (pending)
  -> audit_logs
Local n8n schedule (every 1 min)
  -> POST {{WORKER_BASE_URL}}/admin-commands/process-next
  -> worker claims + executes retry/delete
```

Infra workflow file: `WF-07_admin_command_poller.json`.

## WF-07: Account Health Check

### Trigger

Cron every 6 to 12 hours.

### Purpose

Catch expired sessions before jobs fail.

Worker endpoint:

```text
POST /accounts/:id/check-session
```

Result:

```text
active
login_required
unknown
```

MVP can postpone this until upload automation is stable.

## n8n credentials

Store in n8n credentials or environment variables:

```text
WORKER_BASE_URL
WORKER_INTERNAL_TOKEN
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
NOTIFICATION_WEBHOOK_URL optional
```

Set a stable `N8N_ENCRYPTION_KEY` before serious use. If the encryption key changes unexpectedly, credentials can become unusable.

## n8n environment variables

Recommended:

```text
N8N_ENCRYPTION_KEY=<long-random-secret>
N8N_HOST=<domain-or-ip>
N8N_PROTOCOL=https
WEBHOOK_URL=https://<domain>/
EXECUTIONS_DATA_SAVE_ON_ERROR=all
EXECUTIONS_DATA_SAVE_ON_SUCCESS=none or minimal
EXECUTIONS_DATA_PRUNE=true
EXECUTIONS_DATA_MAX_AGE=168
```

Keep successful execution data pruned to avoid disk growth.

## n8n queue mode future upgrade

Queue mode is not mandatory for MVP. Add later if workflows become heavy or if reliability demands it.

Future services:

```text
n8n-main
n8n-worker
redis
```

Queue mode value:

- Better scalability.
- Workers execute jobs separately.
- More reliable under higher throughput.

MVP does not need this for 4 to 5 videos/day if the heavy worker service is separate.

## Workflow failure rules

n8n failure should not corrupt jobs.

Rules:

- Worker writes authoritative status to Supabase.
- n8n can retry worker endpoint call, but worker endpoints must be idempotent.
- If n8n dies during wait, verification cron should still pick due jobs later.
- Do not depend on one long n8n execution staying alive for hours.

## Process-next workflow pseudo-design

```text
Cron Trigger
  -> HTTP Request: POST /jobs/process-next
  -> IF response.noJob = true
      -> Stop
  -> IF response.success = true
      -> Log success
  -> IF response.loginRequired = true
      -> Notify admin
  -> IF response.needsManualReview = true
      -> Notify admin
  -> Loop max 2 times
```

## Verification workflow pseudo-design

```text
Cron Trigger every 10 minutes
  -> Supabase: select jobs awaiting verification and due
  -> Split in Batches size 1
  -> HTTP Request: POST /jobs/:id/verify
  -> IF completed
       -> Log completed
  -> IF needs_manual_review
       -> Notify admin
```

## n8n data pruning

Because local disk can fill with temp files and n8n execution history, prune aggressively.

Recommended:

```text
Prune successful executions aggressively.
Keep failed execution data longer.
Avoid storing binary data in n8n executions.
```

## n8n acceptance checklist

- Poller runs every 2 to 5 minutes.
- Poller calls worker with internal token.
- Poller processes max 2 jobs per run.
- Verification cron checks due jobs every 10 minutes.
- Failed jobs are not endlessly retried.
- Login-required accounts trigger visible admin status.
- n8n execution history does not store video binaries.
- n8n credentials survive restart.
- Stale locks can be recovered by worker/admin workflow.

## Finalized MVP job intake assumptions - Version 1.1

The n8n workflow must expect only three active niches: `Memes`, `Anime`, and `Sports`. n8n does not decide the account mapping. It passes the job ID to the worker, and the worker resolves mapping from Supabase.

For host safety, n8n must enforce:

```text
Maximum claimed processing jobs: 1
Maximum pending upload orchestration calls: 1
New job poll frequency: every 2 to 5 minutes
Verification delay: approximately 5 minutes after upload attempt
```

If eight links arrive in one day, the system must queue them and process sequentially rather than parallelizing FFmpeg work.

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
