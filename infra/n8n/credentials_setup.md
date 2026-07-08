# n8n Credentials Setup — Project AP-I

Configure n8n credentials **before** activating workflows. Never paste raw secrets into workflow node bodies.

## Prerequisites

1. Copy `.env.example` to `.env` if you have not already.
2. Run `node scripts/setup-local-env.mjs` to generate `N8N_ENCRYPTION_KEY` and local defaults.
3. Set a stable `WORKER_INTERNAL_TOKEN` (minimum 32 characters).
4. Start the stack: `pnpm docker:up`
5. Open http://localhost:5678 and create the n8n owner account (local dev only).

## Required credentials in n8n UI

Create these under **Settings → Credentials**. Reference them by name in imported workflows.

### 1. WorkerToken (required)

| Field | Value |
|-------|-------|
| Type | Header Auth |
| Name | `WorkerToken` |
| Header name | `X-Worker-Token` |
| Header value | Same value as `WORKER_INTERNAL_TOKEN` in `.env` |

Used by all worker HTTP Request nodes (`/jobs/claim`, `/process`, `/upload`, `/verify`, etc.).

### 2. Supabase access (WF-06 optional)

WF-06 reads Supabase via container environment variables (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` from `.env`). Do **not** paste the service role key into workflow nodes.

If you prefer a credential instead of env expressions, create:

| Field | Value |
|-------|-------|
| Type | Header Auth |
| Name | `SupabaseServiceRole` |
| Header name | `apikey` |
| Header value | Your `SUPABASE_SERVICE_ROLE_KEY` |

Then add `Authorization: Bearer <key>` manually on each Supabase HTTP node.

| Field | Value |
|-------|-------|
| Type | Header Auth |
| Name | `WebhookInternalToken` |
| Header name | `X-Webhook-Token` |
| Header value | A long random secret stored in `.env` as `N8N_WEBHOOK_TOKEN` |

Callers (admin dashboard / Vercel server actions) must send this header when hitting n8n webhooks.

## Environment variables

These must be present in `.env` and passed to the n8n container (`infra/docker-compose.yml` loads `../.env`):

```env
N8N_ENCRYPTION_KEY=<64-char hex — generate via setup-local-env.mjs>
N8N_HOST=localhost
N8N_PROTOCOL=http
WEBHOOK_URL=http://localhost:5678/

WORKER_BASE_URL=http://worker:3001
WORKER_INTERNAL_TOKEN=<min 32 chars>

SUPABASE_URL=<your supabase project url>
SUPABASE_SERVICE_ROLE_KEY=<service role key>

VERIFY_DELAY_MINUTES=30
N8N_WEBHOOK_TOKEN=<random secret for webhook auth>
```

Inside Docker, n8n must call the worker at `http://worker:3001`, not `http://localhost:3001`.

## Security rules

1. **Never** hardcode tokens in workflow JSON or node parameter fields.
2. Set `N8N_ENCRYPTION_KEY` **before** creating credentials — otherwise n8n stores them unencrypted.
3. Do not expose the n8n editor publicly without authentication.
4. Back up the `n8n_data` Docker volume before migrations or `docker compose down -v`.
5. Redact secrets from execution logs and screenshots.
6. Rotate `WORKER_INTERNAL_TOKEN` and `N8N_WEBHOOK_TOKEN` if they are ever exposed.

## After creating credentials

1. Import workflows from `infra/n8n/workflows/`.
2. Open each workflow and confirm credential dropdowns show the correct names (`WorkerToken`, etc.).
3. In **WF-01**, set **Run WF-02 Process Job** → workflow = `WF-02 Process Job`.
4. In **WF-02**, set **Run WF-03 Verify** → workflow = `WF-03 Upload Verification`.
5. Activate WF-01 (and optional WF-06) after manual test execution succeeds.

## Optional: n8n API key for CLI import + MCP

After logging in with `N8N_LOGIN_EMAIL` / `N8N_LOGIN_PASSWORD`:

1. **Settings → API → Create API Key**
2. Add to `.env`: `N8N_API_KEY=<key>`
3. Point the n8n MCP server at `http://localhost:5678` (login or API key per MCP plugin docs)
4. Run: `node scripts/import-n8n-workflows.mjs`

## Verification checklist

- [ ] Worker token is in n8n Credentials, not in node bodies
- [ ] `N8N_ENCRYPTION_KEY` was set before credential creation
- [ ] Worker health check works from host: `curl http://localhost:3001/health`
- [ ] Claim works with token header (see `infra/n8n/README.md`)
- [ ] WF-01 Execute Workflow nodes point to WF-02 / WF-03 after import
- [ ] Webhook workflows require `X-Webhook-Token` before calling worker
