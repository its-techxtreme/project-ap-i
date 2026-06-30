# Local n8n (Docker)

## Prerequisites

1. Run `node scripts/setup-local-env.mjs` from the repo root (fills n8n + NVIDIA defaults in `.env`).
2. Ensure `.env` has `WORKER_INTERNAL_TOKEN` (min 32 chars) and Supabase vars set.

## Start stack

```bash
docker compose -f infra/docker-compose.yml up -d --build
```

| Service | URL |
|---------|-----|
| n8n editor | http://localhost:5678 |
| Worker API | http://localhost:3001/health |

Stop:

```bash
docker compose -f infra/docker-compose.yml down
```

## First-time n8n setup

1. Open http://localhost:5678 and create your owner account (local only).
2. **Before saving credentials**, confirm `N8N_ENCRYPTION_KEY` is set in `.env` — n8n encrypts stored credentials with this key.
3. Create credentials (never paste secrets into workflow node bodies):
   - **WorkerToken** — type *Header Auth*, header name `X-Worker-Token`, value = your `WORKER_INTERNAL_TOKEN`.
   - **SupabaseServiceRole** — type *Header Auth* or use HTTP with headers:
     - `apikey: <SUPABASE_SERVICE_ROLE_KEY>`
     - `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`
4. In HTTP Request nodes that call the worker, use base URL **`http://worker:3001`** (Docker internal hostname), not `localhost`.

## MVP workflow wiring (Phase 12)

| Workflow | Trigger | Worker call |
|----------|---------|-------------|
| WF-01 Poller | Every 2 min | `POST http://worker:3001/jobs/claim` |
| WF-02 Process | After claim | `POST .../jobs/:id/process` then `.../upload` |
| WF-03 Verify | ~30 min later | `POST .../jobs/:id/verify` |

Export/import JSON workflows will live in this folder in Phase 12.

## Troubleshooting

- **n8n can't reach worker** — use `http://worker:3001` inside n8n, not `http://localhost:3001`.
- **Credentials lost after restart** — `n8n_data` volume must persist; don't run `docker compose down -v` unless intentional.
- **Encryption key changed** — existing n8n credentials become unreadable; recreate them after setting a stable `N8N_ENCRYPTION_KEY`.
