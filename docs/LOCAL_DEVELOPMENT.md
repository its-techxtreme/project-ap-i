# Local Development Guide — Project AP-I

> **Deployment model (v1.2):** MVP runs entirely on the **local developer machine** (Windows). Hostinger VPS deployment is **deferred**. All paths formerly documented as `/opt/project-ap-i` map to the **repository root** on local dev.

## What runs where (local MVP)

| Component | Where it runs | How to start |
|-----------|---------------|--------------|
| Web app (Next.js) | Local — `apps/web` | `pnpm --filter @project-api/web dev` |
| Worker API (real uploads) | **Native Node on host** | `pnpm stack:up` (preferred) |
| Worker API (mock only) | Docker | `pnpm docker:up:full` |
| n8n | Local Docker | Started by `pnpm stack:up` or `pnpm docker:up` → http://localhost:5678 |
| Supabase | Cloud (hosted project) | Configure in `.env` / `.env.local` |
| Google Drive | Cloud API | OAuth tokens in `.env` |
| Playwright profiles | Local disk, **outside git** | `playwright-profiles/` at repo root (gitignored) |

## Canonical unattended stack (Phase 16+)

Real YouTube/Instagram uploads need **installed Google Chrome** + persistent profiles on the host. The Docker worker image cannot do this reliably.

```bash
# One command: free port 3001, start Docker n8n, build + start native worker
pnpm stack:up
pnpm stack:status

# Web (separate terminal)
pnpm --filter @project-api/web dev

# Stop everything
pnpm stack:down
```

n8n reaches the host worker at `http://host.docker.internal:3001` (`WORKER_BASE_URL` inside the n8n container).

## Autostart on Windows logon (recommended for daily use)

So you do not need to type `pnpm stack:up` every morning:

```bash
# One-time install (current Windows user only — no admin / no SYSTEM service)
pnpm stack:autostart:install
```

What it does:

- Registers Scheduled Task **ProjectAP-I Stack Autostart** at **logon**
- Runs as **your user** with **Limited** rights (not elevated)
- Waits for Docker Engine (launches Docker Desktop if needed)
- Then runs the same safe path as `pnpm stack:up`
- Skips if the worker is already healthy
- Writes `.stack-autostart.log` (no secrets)

Optional: Docker Desktop → Settings → General → **Start Docker Desktop when you sign in**.

```bash
pnpm stack:autostart            # test now (same script the task runs)
pnpm stack:status               # confirm worker + n8n
pnpm stack:autostart:uninstall  # remove the Scheduled Task
```

Laptop off → nothing runs. Log in → after ~3 minutes + Docker ready → n8n + worker come up.

**Mock / dry-run only** (no real Playwright uploads):

```bash
pnpm docker:up:full   # Docker worker + n8n; upload flags forced false in compose
```

## Prerequisites

- Node.js >= 20, pnpm >= 9
- Docker Desktop (for n8n; optional Docker worker for mock mode)
- FFmpeg and yt-dlp on PATH (for native worker)
- **Google Chrome** installed (required for real uploads — `PLAYWRIGHT_CHANNEL=chrome`)
- Supabase project with migrations applied (including `0015_reclaim_stale_locks.sql`)

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

# 5. Start canonical stack (n8n + native worker)
pnpm stack:up

# 6. Configure n8n (first time only)
# Open http://localhost:5678 → create owner account → import workflows
# See infra/n8n/README.md — include WF-08 Verification Cron

# 7. Start web app (separate terminal)
pnpm --filter @project-api/web dev
```

Open http://localhost:3000 for the web app.

## Local folder layout

```text
<repo-root>/
  .env                          ← shared secrets (never commit)
  .stack-worker.pid             ← native worker PID from stack:up (gitignored)
  apps/web/.env.local           ← Next.js env (Supabase public keys + server secrets)
  playwright-profiles/          ← browser sessions (gitignored)
    memes-yt/
    memes-ig/
    ...
  infra/docker-compose.yml      ← n8n (+ optional Docker worker profile)
  apps/worker/tmp/jobs/         ← native worker temp
```

## Key environment variables (local)

```env
WORKER_BASE_URL=http://localhost:3001
N8N_HOST=localhost
N8N_PROTOCOL=http
WEBHOOK_URL=http://localhost:5678/
REAL_UPLOADS_ENABLED=false
PLAYWRIGHT_HEADLESS=false
PLAYWRIGHT_CHANNEL=chrome          # required when REAL_UPLOADS_ENABLED=true
PLAYWRIGHT_PROFILES_DIR=C:\path\to\repo\playwright-profiles
VERIFY_DELAY_MINUTES=5             # post-upload verify wait (use 1–2 for local smoke)
BACKGROUND_MUSIC_PATH=C:\path\to\repo\apps\worker\assets\bgm\absolutesound-background-guitar-no-copyright-561871.mp3
TMP_DIR=C:\path\to\repo\apps\worker\tmp\jobs
```

`pnpm stack:up` rewrites Docker-style `/app/...` paths to local defaults automatically.

## Daily workflow

```bash
pnpm stack:up
pnpm stack:status
pnpm --filter @project-api/web dev
# ... submit jobs via /submit — n8n WF-01 claims within ~2 minutes
pnpm stack:down
```

## Playwright profile login (local)

Profiles live in `playwright-profiles/` (gitignored). Log in manually per niche/platform:

```bash
pnpm --filter @project-api/worker smoke:playwright -- --login --profile memes-yt
pnpm --filter @project-api/worker smoke:playwright -- --login --profile ig-collector
```

Collector uses a dedicated `ig-collector` Chrome profile (not a niche upload account). Set `COLLECTOR_ENABLED=true` on the laptop `.env` only, then restart the worker. Unsorted cargo has an On/Off switch (`collector_armed`) to pause scraping without stopping the worker. Boot and 3-hour ticks still happen, but only two scrapes per local day actually open Chrome. Each collector pass searches sports / anime / memes for three new unique reels each, then checks unread DMs only and closes Chrome. Playwright Chrome is muted. If Instagram asks for 2FA or CAPTCHA, complete it yourself in the login window — never automate a bypass. Mark the collector pass as `loginRequired` and continue the upload queue.

See `apps/worker/scripts/smoke-playwright.ts`. **Never commit profiles or cookies.**

YouTube uploads always select **“No, it’s not made for kids”** (never Made for Kids).

## Real uploads

Opt-in via `.env` on the **local machine only**:

```env
REAL_UPLOADS_ENABLED=true
YOUTUBE_UPLOADS_ENABLED=true
INSTAGRAM_UPLOADS_ENABLED=true
PLAYWRIGHT_CHANNEL=chrome
```

Worker refuses to start real uploads without `PLAYWRIGHT_CHANNEL=chrome`. Reset all upload flags to `false` after smoke testing. Never enable in CI, Vercel, or committed env files.

### Drive OAuth refresh

```bash
node --env-file=.env apps/worker/scripts/drive-oauth-via-profile.mjs
node --env-file=.env scripts/google-drive-ensure-folders.mjs
```

## Concurrency on local machine

Keep `MAX_FFMPEG_CONCURRENCY=1` on typical dev laptops.

## Troubleshooting

| Issue | Check |
|-------|-------|
| Worker 401 | `WORKER_INTERNAL_TOKEN` matches in `.env` and n8n `WorkerToken` credential |
| n8n can't reach worker | Canonical: `WORKER_BASE_URL=http://host.docker.internal:3001` in n8n container. Mock: `http://worker:3001` |
| Port 3001 busy | `pnpm stack:up` frees it; or `pnpm stack:down` |
| Playwright login_required | Re-run profile login; confirm `PLAYWRIGHT_CHANNEL=chrome` |
| Drive upload fails | Drive OAuth scripts above; see `infra/google-drive/SETUP.md` |
| Job stuck `locked` | Migration `0015` reclaims expired locks on next claim |
| Dashboard shows Processing but no new activity | Check n8n: pollers must be **Active**. `pnpm stack:up` now re-activates them; if WF-01/02 fail, run `pnpm n8n:setup` |
| Queue frozen / claim always skipped | A crash-stuck `uploading` job with no lock used to block claims — fixed; WF-08 also drains pending `ready_to_upload` |
| Jobs stay queued / ready_to_upload with daily limit message | Expected when an account hit `DAILY_UPLOAD_LIMIT_PER_ACCOUNT` (default 5) in the last rolling 24h — claim rechecks deferred jobs every **30 minutes**; resumes when older uploads age out of the window |
| Verification never runs | Activate WF-08; or wait for WF-02 Wait → WF-03 |

## Deferred: VPS production

When moving to a remote VPS later, use `docs/09_Deployment_Operations_Runbook_Project_AP-I.md` appendix **Future VPS deployment** and `infra/nginx.example.conf`. No VPS setup is required for Phases 14–16 on local.
