# n8n Orchestration — Project AP-I (Phase 12)

n8n orchestrates the pipeline only. It does **not** run FFmpeg, yt-dlp, or Playwright. All heavy work goes through the worker API with `X-Worker-Token`.

## Comprehension checkpoint

```
Confirmed: n8n must NOT run FFmpeg directly
Confirmed: Poll interval is every 2 to 5 minutes (MVP: 2)
Confirmed: Worker token must be sent in header named X-Worker-Token
Confirmed: n8n should claim at most 1 job per poll cycle in MVP
Confirmed: Verification delay is approximately 5 minutes after upload
```

## Prerequisites

1. Docker Desktop running
2. `.env` filled from `.env.example`
3. Run `node scripts/setup-local-env.mjs` (generates `N8N_ENCRYPTION_KEY`, local URLs)
4. Set real values for at minimum:
   - `WORKER_INTERNAL_TOKEN` (min 32 chars)
   - `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
   - `N8N_WEBHOOK_TOKEN` (for WF-04 / WF-05 webhook auth)

See [credentials_setup.md](./credentials_setup.md) for full credential instructions.

## Start the stack

```bash
pnpm docker:up
```

| Service | URL | Image |
|---------|-----|-------|
| n8n editor | http://localhost:5678 | `docker.n8n.io/n8nio/n8n:2.29.7` |
| Worker API | http://localhost:3001/health | built from `apps/worker` |

Logs:

```bash
pnpm docker:logs
```

Stop (keeps n8n data volume):

```bash
pnpm docker:down
```

## First-time n8n setup (manual — do this before importing workflows)

1. Open http://localhost:5678
2. Create your local owner account (email + password — store only for local dev)
3. Confirm `N8N_ENCRYPTION_KEY` is already in `.env` **before** saving any credentials
4. Create credentials per [credentials_setup.md](./credentials_setup.md):
   - `WorkerToken` (Header Auth → `X-Worker-Token`)
   - `WebhookInternalToken` (Header Auth → `X-Webhook-Token`)
5. Optional: create n8n API key → add `N8N_API_KEY` to `.env` for CLI import

**Stop here if credentials are not ready** — workflows will fail without `WorkerToken`.

## Import workflows

### Option A — n8n UI

1. **Workflows → Import from File**
2. Import each JSON from `infra/n8n/workflows/`:
   - `WF-01_new_job_poller.json`
   - `WF-02_process_job.json`
   - `WF-03_upload_verification.json`
   - `WF-04_manual_retry_webhook.json`
   - `WF-05_drive_cleanup_webhook.json`
   - `WF-06_account_health_check.json` (optional)
   - `WF-07_admin_command_poller.json` (hosted admin retry/delete outbox)
   - `WF-08_verification_cron.json` (due-job verification fallback)
3. Link credentials on each HTTP node (`WorkerToken`, `WebhookInternalToken`)
4. In WF-01 → **Run WF-02 Process Job** node → select workflow `WF-02 Process Job`
5. In WF-02 → **Run WF-03 Verify** node → select workflow `WF-03 Upload Verification`
6. Activate WF-08 so verification still runs if n8n restarts during the WF-02 wait

### Option B — CLI (after n8n login + API key)

```bash
pnpm n8n:import
pnpm n8n:setup
pnpm n8n:test:all
```

## Workflow map

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| WF-01 | Every 2 min | Claim one queued job → run WF-02 |
| WF-02 | Called by WF-01 | Process → upload → wait ~5 min → run WF-03 |
| WF-03 | Called by WF-02 | Verify upload; retry or flag manual review |
| WF-04 | Webhook | Optional local manual retry (`/project-ap-i/manual-retry`) |
| WF-05 | Webhook | Optional local Drive cleanup (`/project-ap-i/drive-cleanup`) |
| WF-06 | Every 6 h | Alert on `login_required` or stale uploads (optional) |
| WF-07 | Every 1 min | Drain `admin_commands` outbox → `POST /admin-commands/process-next` |
| WF-08 | Every 10 min | Query due `awaiting_verification` jobs → `POST /jobs/:id/verify` |

Worker calls use `{{ $env.WORKER_BASE_URL }}`.

Canonical unattended stack (`pnpm stack:up`): n8n sets `WORKER_BASE_URL=http://host.docker.internal:3001` (native worker on host). Mock stack (`pnpm docker:up:full`): `http://worker:3001`.

### Hosted admin → local worker (outbox)

Vercel cannot reach a private worker. Admin Retry / Delete on the hosted dashboard:

1. Inserts a pending row into Supabase `admin_commands`
2. Writes an audit log
3. Returns “queued” to the UI

While Docker is up, **WF-07** claims and executes those commands locally. Ignore remains a direct DB update (no worker).

Import `WF-07_admin_command_poller.json` and attach `WorkerToken`.

## Manual verification

```bash
# Worker health (no auth)
curl http://localhost:3001/health

# Claim (requires token from .env — do not commit output)
curl -X POST -H "X-Worker-Token: $WORKER_INTERNAL_TOKEN" http://localhost:3001/jobs/claim
```

Checklist:

1. WF-01 runs on schedule and claims at most one job per cycle
2. All worker HTTP nodes use `WorkerToken` credential (not inline secrets)
3. Verification wait is ~5 minutes (`VERIFY_DELAY_MINUTES`)
4. Failed executions appear in n8n execution history
5. Webhook workflows reject requests without `X-Webhook-Token`

## Troubleshooting

- **n8n can't reach worker** — canonical stack uses `http://host.docker.internal:3001`; full Docker mock uses `http://worker:3001` (never `localhost:3001` from inside the n8n container)
- **Credentials unreadable after restart** — `N8N_ENCRYPTION_KEY` changed; recreate credentials
- **Execute Workflow node empty** — re-select WF-02 / WF-03 after import
- **Wait node stuck** — activate **WF-08 Verification Cron**; it picks up due jobs even if WF-02's wait was interrupted
- **Overview shows 0 prod executions but Executions tab has rows** — n8n Insights compacts raw metrics into `insights_by_period` on an interval (default **60 minutes**). Until compaction runs, the Overview banner stays at 0 even though `/home/executions` lists successful schedule/webhook runs. Local Docker sets `N8N_INSIGHTS_COMPACTION_INTERVAL_MINUTES=1` so stats update within ~1 minute after restart. Manual test runs from the editor do **not** count toward prod stats (only active schedule/webhook parent workflows do).

## Files

```
infra/n8n/
  README.md
  credentials_setup.md
  workflows/
    WF-01_new_job_poller.json
    WF-02_process_job.json
    WF-03_upload_verification.json
    WF-04_manual_retry_webhook.json
    WF-05_drive_cleanup_webhook.json
    WF-06_account_health_check.json
    WF-07_admin_command_poller.json
    WF-08_verification_cron.json
```
