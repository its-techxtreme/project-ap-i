# n8n workflow exports (ready to import)

These JSON files are portable exports of the Project AP-I n8n workflows. They are safe to commit: **no private credential values**, no instance credential IDs, and no host-specific workflow IDs.

| File | Workflow | Role |
|------|----------|------|
| `WF-01_new_job_poller.json` | WF-01 New Job Poller | Every 2 min: claim one queued job → run WF-02 |
| `WF-02_process_job.json` | WF-02 Process Job | Process → upload → wait → run WF-03 |
| `WF-03_upload_verification.json` | WF-03 Upload Verification | Verify uploads; retry or flag manual review |
| `WF-04_manual_retry_webhook.json` | WF-04 Manual Retry Webhook | Optional local retry webhook |
| `WF-05_drive_cleanup_webhook.json` | WF-05 Drive Cleanup Webhook | Optional local Drive cleanup webhook |
| `WF-06_account_health_check.json` | WF-06 Account Health Check | Optional account health alerts |
| `WF-07_admin_command_poller.json` | WF-07 Admin Command Poller | Drain hosted admin retry/delete outbox |
| `WF-08_verification_cron.json` | WF-08 Verification Cron | Verify due jobs if WF-02 wait was interrupted |

## What is stripped vs kept

**Kept**

- Nodes, connections, and schedule / webhook settings
- Credential *names* only (`WorkerToken`, `WebhookInternalToken`)
- Env expressions such as `{{ $env.WORKER_BASE_URL }}` and `{{ $env.SUPABASE_SERVICE_ROLE_KEY }}`
- Display names for sub-workflows (`cachedResultName`)

**Removed / blanked**

- Credential IDs and secret values
- Instance-specific `workflowId.value` links (re-wired by `pnpm n8n:setup`)
- `pinData`, tags, shared ownership, and other host metadata

## Import in the n8n UI

1. Start the stack (`pnpm stack:up`) and open http://localhost:5678
2. Create Header Auth credentials named exactly **`WorkerToken`** and **`WebhookInternalToken`** (see [`../credentials_setup.md`](../credentials_setup.md))
3. **Workflows → Import from File** → pick each JSON in this folder (or import all eight)
4. Open each imported workflow and confirm HTTP nodes reference those credential names
5. Run `pnpm n8n:setup` (or manually link WF-01 → WF-02 and WF-02 → WF-03, then activate)

## Import via CLI

```bash
# Requires N8N_API_KEY in .env (Settings → API in n8n)
pnpm n8n:import
pnpm n8n:setup
```

## Refresh exports from a running n8n

After you change workflows locally and want the repo copies updated (still sanitized):

```bash
pnpm n8n:export
```

Requires a live n8n instance and `N8N_API_KEY` in `.env`.
