# Local Development Guide — Project AP-I

> **Deployment model (v1.2):** MVP runs entirely on the **local developer machine** (Windows). Hostinger VPS deployment is **deferred**. All paths formerly documented as `/opt/project-ap-i` map to the **repository root** on local dev.

## What runs where (local MVP)

| Component | Where it runs | How to start |
|-----------|---------------|--------------|
| Web app (Next.js) | Local — `apps/web` | `pnpm --filter @project-api/web dev` |
| Worker API | Local Docker or native Node | `pnpm docker:up` or `pnpm --filter @project-api/worker dev` |
| n8n | Local Docker | `pnpm docker:up` → http://localhost:5678 |
| Supabase | Cloud (hosted project) | Configure in `.env` / `.env.local` |
| Google Drive | Cloud API | OAuth tokens in `.env` |
| Playwright profiles | Local disk, **outside git** | `playwright-profiles/` at repo root (gitignored) |

## Prerequisites

- Node.js >= 20, pnpm >= 9
- Docker Desktop (for worker + n8n stack)
- FFmpeg and yt-dlp on PATH (for native worker dev) or inside Docker image
- Google Chrome (for Playwright upload sessions via `PLAYWRIGHT_CHANNEL=chrome`)
- Supabase project with migrations applied

## First-time setup

```bash
# 1. Install dependencies
pnpm install

# 2. Copy env template and fill Supabase keys
cp .env.example .env
cp .env.example apps/web/.env.local   # or symlink — web reads .env.local

# 3. Generate local defaults (n8n key, localhost URLs, upload flags=false)
pnpm setup:local-env

# 4. Apply Supabase migrations (via Supabase CLI or MCP)
# See docs/07 and supabase/migrations/

# 5. Start worker + n8n
pnpm docker:up

# 6. Configure n8n (first time only)
# Open http://localhost:5678 → create owner account → import workflows
# See infra/n8n/README.md

# 7. Start web app (separate terminal)
pnpm --filter @project-api/web dev
```

Open http://localhost:3000 for the web app.

## Local folder layout

```text
<repo-root>/
  .env                          ← shared secrets (never commit)
  apps/web/.env.local           ← Next.js env (Supabase public keys + server secrets)
  playwright-profiles/          ← browser sessions (gitignored)
    memes-yt/
    memes-ig/
    ...
  infra/docker-compose.yml      ← worker + n8n
  tmp/                          ← optional native worker temp (if not using Docker paths)
```

## Key environment variables (local)

```env
WORKER_BASE_URL=http://localhost:3001
N8N_HOST=localhost
N8N_PROTOCOL=http
WEBHOOK_URL=http://localhost:5678/
REAL_UPLOADS_ENABLED=false
PLAYWRIGHT_HEADLESS=false
PLAYWRIGHT_CHANNEL=chrome
PLAYWRIGHT_PROFILES_DIR=C:\path\to\repo\playwright-profiles   # optional; defaults to repo root
```

Run `pnpm setup:local-env` to fill localhost defaults idempotently.

## Daily dev workflow

```bash
# Terminal 1 — stack
pnpm docker:up
pnpm docker:logs          # optional, watch worker/n8n

# Terminal 2 — web
pnpm --filter @project-api/web dev

# Checks before committing
pnpm check
```

## Playwright profile login (local)

Profiles live in `playwright-profiles/` (gitignored). Log in manually per niche/platform:

```bash
pnpm --filter @project-api/worker smoke:playwright -- --login --profile memes-yt
```

See `apps/worker/scripts/smoke-playwright.ts` and Phase 13 docs. **Never commit profiles or cookies.**

## Real uploads (Phase 15+)

Real uploads are opt-in via `.env` on the **local machine only**:

```env
REAL_UPLOADS_ENABLED=true
YOUTUBE_UPLOADS_ENABLED=true
INSTAGRAM_UPLOADS_ENABLED=true
```

Reset all three to `false` after smoke testing. Never enable in CI, Vercel, or committed env files.

## Concurrency on local machine

Keep `MAX_FFMPEG_CONCURRENCY=1` on typical dev laptops (same rule as original VPS spec). Increase only after profiling on your hardware.

## Optional: native worker (no Docker)

For debugging worker code without rebuilding the image:

```bash
pnpm --filter @project-api/worker dev
```

Ensure FFmpeg, yt-dlp, and env vars are available on PATH. Set `TMP_DIR` and `WATERMARK_PATH` to local paths (not `/app/...`).

## Troubleshooting

| Issue | Check |
|-------|-------|
| Worker 401 | `WORKER_INTERNAL_TOKEN` matches in `.env` and n8n `WorkerToken` credential |
| n8n can't reach worker | Docker: `WORKER_BASE_URL=http://worker:3001` (set in compose). Native worker: `http://host.docker.internal:3001` on Windows Docker |
| Web can't reach worker | `WORKER_BASE_URL=http://localhost:3001` in web server env |
| Playwright login_required | Re-run profile login script; check `PLAYWRIGHT_PROFILES_DIR` |
| Drive upload fails | Run `node --env-file=.env scripts/google-drive-auth.mjs` — see `infra/google-drive/SETUP.md` |

## Deferred: VPS production

When moving to a remote VPS later, use `docs/09_Deployment_Operations_Runbook_Project_AP-I.md` appendix **Future VPS deployment** and `infra/nginx.example.conf`. No VPS setup is required for Phases 14–16 on local.
