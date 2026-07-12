# Project AP-I

Short-form content intake → process → publish.

Submitters paste a YouTube or Instagram link, pick a niche (**Memes**, **Anime**, or **Sports**), and confirm rights. The system downloads the video, applies a niche watermark, stages it on Google Drive, generates captions from the **original source text** (AI rephrase + tags), then uploads to the matching YouTube and Instagram accounts.

**Live demo:** https://project-ap-i.vercel.app — public submit form; dashboard has a **read-only demo** login (see `DEMO_USERNAME` / `DEMO_PASSWORD_HASH` in `.env.example`).

Real platform uploads are **off by default**. Enable them only on a local machine with Chrome profiles you control.

---

## How the stack fits together

| Piece | Role | Default URL |
|-------|------|-------------|
| **Web** (`apps/web`) | Submit form + admin UI (Next.js) | http://localhost:3000 |
| **Worker** (`apps/worker`) | Download, FFmpeg, Drive, AI metadata, Playwright uploads | http://localhost:3001 |
| **n8n** (Docker) | Polls / claims jobs and calls the worker | http://localhost:5678 |
| **Supabase** (cloud) | Auth, jobs DB, RLS — source of truth | your project URL |
| **Google Drive** | Staging for processed videos | OAuth in `.env` |

**Recommended local run:** native worker on the host (needs Chrome) + n8n in Docker via `pnpm stack:up`.

---

## Prerequisites

Install these before the first setup:

1. **Node.js 20+** and **pnpm 9+**
2. **Docker Desktop** (for n8n)
3. **FFmpeg** and **yt-dlp** on your PATH (native worker)
4. **Google Chrome** (required for real uploads)
5. A **Supabase** project (you will apply SQL migrations from this repo)

Optional for production-like smoke: Google Drive OAuth app, NVIDIA NIM (or other OpenAI-compatible) API key for AI captions.

---

## First-time setup (follow in order)

### 1. Clone and install

```bash
git clone <your-repo-url> "Project AP-I"
cd "Project AP-I"
pnpm install
```

### 2. Environment files

```bash
cp .env.example .env
cp .env.example apps/web/.env.local
```

Fill at least:

| Variable | Where | Notes |
|----------|--------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | `.env` + `.env.local` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env` + `.env.local` | Public anon key |
| `SUPABASE_URL` | `.env` | Same URL (worker / n8n) |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env` (+ web server env) | **Server only** — never expose to the browser |
| `WORKER_INTERNAL_TOKEN` | `.env` | Random secret, **≥ 32 characters**, same value everywhere |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` / `ADMIN_SESSION_SECRET` | web env | Hash via `node --env-file=.env scripts/hash-admin-password.mjs` |

Then generate local defaults (localhost URLs, n8n encryption key, upload flags = `false`):

```bash
pnpm setup:local-env
```

### 3. Database

Apply every migration under `supabase/migrations/` to your Supabase project (Supabase CLI, dashboard SQL, or MCP). Include the latest lock-reclaim migration (`0015_reclaim_stale_locks.sql`).

Seed niches / settings from `supabase/seed.sql` if your project is empty.

### 4. Start n8n + worker

```bash
pnpm stack:up
pnpm stack:status
```

This frees port **3001**, starts Docker **n8n**, and launches the **native worker**.

- Worker health: http://127.0.0.1:3001/health  
- n8n UI: http://localhost:5678  

### 5. Configure n8n (once)

1. Open n8n → create the local owner account.
2. Create Header Auth credentials (see [`infra/n8n/README.md`](./infra/n8n/README.md)):
   - `WorkerToken` → header `X-Worker-Token` = your `WORKER_INTERNAL_TOKEN`
   - `WebhookInternalToken` → header `X-Webhook-Token` = your `N8N_WEBHOOK_TOKEN`
3. Import workflows from `infra/n8n/workflows/` (WF-01 … WF-08), or:

```bash
# Optional: set N8N_API_KEY in .env first
pnpm n8n:import
pnpm n8n:setup
```

4. Activate the pollers, especially **WF-01**, **WF-07**, and **WF-08** (verification cron).

n8n inside Docker must call the host worker at:

```text
http://host.docker.internal:3001
```

### 6. Start the web app

```bash
pnpm --filter @project-api/web dev
```

Open http://localhost:3000 → submit at `/submit`, admin at `/admin` (after login).

### 7. Google Drive + AI (for full pipeline)

- Drive: follow [`infra/google-drive/SETUP.md`](./infra/google-drive/SETUP.md), then put client id/secret/refresh token and folder IDs in `.env`.
- AI captions: set `AI_PROVIDER_*` in `.env` (NVIDIA NIM free tier is documented in `.env.example`). Without AI, the worker falls back to cleaned source caption + niche tags.

### 8. Playwright logins (only if you enable real uploads)

Profiles live in `playwright-profiles/` (gitignored). Example:

```bash
pnpm --filter @project-api/worker smoke:playwright -- --login --profile memes-yt
```

Repeat per niche/platform profile you use. **Never commit** that folder.

---

## Daily use

```bash
pnpm stack:up          # n8n + native worker
pnpm stack:status      # quick health check
pnpm --filter @project-api/web dev

# when done
pnpm stack:down
```

Optional Windows logon autostart (your user only):

```bash
pnpm stack:autostart:install
```

Details: [`docs/LOCAL_DEVELOPMENT.md`](./docs/LOCAL_DEVELOPMENT.md).

---

## Real uploads (opt-in, local only)

Keep these **false** unless you are deliberately smoke-testing on your machine:

```env
REAL_UPLOADS_ENABLED=false
YOUTUBE_UPLOADS_ENABLED=false
INSTAGRAM_UPLOADS_ENABLED=false
```

To enable locally:

```env
REAL_UPLOADS_ENABLED=true
YOUTUBE_UPLOADS_ENABLED=true
INSTAGRAM_UPLOADS_ENABLED=true
PLAYWRIGHT_CHANNEL=chrome
PLAYWRIGHT_HEADLESS=false
```

Then restart with `pnpm stack:up`. Turn the flags back to `false` afterward. Never enable real uploads in CI or on Vercel.

---

## Niches

| Niche | Slug | Accounts |
|-------|------|----------|
| Memes | `memes` | 1 YouTube + 1 Instagram (DB-mapped) |
| Anime | `anime` | 1 YouTube + 1 Instagram |
| Sports | `sports` | 1 YouTube + 1 Instagram |

Submitters never pick target accounts — mapping is resolved server-side from `niche_id`.

---

## Repo layout

```text
apps/web/          Next.js submit + admin
apps/worker/       Pipeline worker (download → process → Drive → metadata → upload)
packages/shared/   Shared types, validation, status enums
supabase/          SQL migrations + seed
infra/n8n/         Workflow JSON + n8n docs
infra/google-drive/ Drive OAuth setup
scripts/           stack:up, env helpers, n8n import
docs/              Specs and runbooks
```

---

## Checks

```bash
pnpm check
# lint + typecheck + test + build
```

Targeted:

```bash
pnpm test:worker
pnpm test:web
pnpm test:security
```

---

## Documentation

| Doc | Use it for |
|-----|------------|
| [Local Development](./docs/LOCAL_DEVELOPMENT.md) | Full local runbook + troubleshooting |
| [n8n README](./infra/n8n/README.md) | Workflow import and credentials |
| [Drive SETUP](./infra/google-drive/SETUP.md) | OAuth and folders |
| [Docs index](./docs/00_Project_AP-I_Documentation_Index.md) | PRD, architecture, security, ops |

---

## Security reminders

- Never commit `.env`, `.env.local`, Playwright profiles, Drive tokens, or session cookies.
- Keep `SUPABASE_SERVICE_ROLE_KEY` and `WORKER_INTERNAL_TOKEN` off the client.
- `.env.example` uses `REPLACE_ME` placeholders only.

---

## Author

Atharva (Techno)
