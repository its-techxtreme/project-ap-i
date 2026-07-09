# Project AP-I

Project AP-I is a client-approved short-form content intake, processing, and publishing system. It accepts submitted video links from a simple form, processes each video (speed adjustment, watermarking), and automatically uploads the result to both YouTube and Instagram for the appropriate niche account. The system is built for reliability, auditability, and safe defaults — real uploads are disabled by default.

## Deployment model (MVP)

**Everything runs locally** on the developer machine (Windows):

| Component | Location |
|-----------|----------|
| Web app | `localhost:3000` — `pnpm --filter @project-api/web dev` |
| Worker API | `localhost:3001` — Docker or native Node |
| n8n | `localhost:5678` — Docker |
| Supabase | Cloud (hosted project) |
| Playwright profiles | `./playwright-profiles/` (gitignored) |

Remote VPS deployment is **deferred**. See `docs/LOCAL_DEVELOPMENT.md` for the full local runbook.

## Finalized Niches

| Niche  | YouTube Account | Instagram Account |
|--------|----------------|-------------------|
| Memes  | one YouTube account | one Instagram account |
| Anime  | one YouTube account | one Instagram account |
| Sports | one YouTube account | one Instagram account |

Account mapping is resolved server-side from `niche_id`. Submitters never choose target accounts.

## Monorepo Structure

```
project-ap-i/
  apps/
    web/        — Next.js (App Router) frontend
    worker/     — Node.js/TypeScript backend worker
  packages/
    shared/     — Shared constants, schemas, status enums, validation helpers
  supabase/
    migrations/ — Supabase SQL migrations (source of truth for schema)
    seed.sql    — Seed data for niches and system settings
  infra/
    docker-compose.yml    — Local worker + n8n stack
    n8n/                  — Workflow JSON + setup docs
    google-drive/         — Drive OAuth setup
  scripts/      — Local env setup, n8n import, Drive auth helpers
  docs/         — Full project documentation
  prompts/      — Phase-by-phase Cursor execution prompts
```

## Prerequisites

- Node.js >= 20.0.0
- pnpm >= 9.0.0
- Docker Desktop (worker + n8n)
- FFmpeg + yt-dlp (PATH, or inside Docker image)
- Google Chrome (Playwright upload sessions)

## Quick start (local)

```bash
pnpm install
cp .env.example .env
pnpm setup:local-env          # localhost URLs, n8n key, flags=false
pnpm docker:up                # worker :3001 + n8n :5678
pnpm --filter @project-api/web dev   # web :3000
```

See [`docs/LOCAL_DEVELOPMENT.md`](./docs/LOCAL_DEVELOPMENT.md) for first-time n8n setup, Playwright login, and troubleshooting.

## Run All Checks

```bash
pnpm check
# runs: pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Safe MVP Behavior

**Real uploads are disabled by default.** Keep these `false` unless running Phase 15 smoke test on your local machine:

```
REAL_UPLOADS_ENABLED=false
YOUTUBE_UPLOADS_ENABLED=false
INSTAGRAM_UPLOADS_ENABLED=false
```

## Documentation

| # | Document |
|---|----------|
| — | **[Local Development Guide](./docs/LOCAL_DEVELOPMENT.md)** ← start here |
| 01 | PRD |
| 02 | System Architecture |
| 03 | Tech Stack & Infrastructure |
| 04 | Frontend Specification |
| 05 | Backend Worker Specification |
| 06 | n8n Workflow Specification |
| 07 | Database & Storage Design |
| 08 | Authentication & Security |
| 09 | Deployment & Operations Runbook |
| 10 | Cursor Rules |
| 11 | Cursor Detailed Execution Plan |
| 12 | Phase-Based Delivery Plan |

## Phase Delivery

Development is structured in 17 phases (Phase 0–16). Per-phase Cursor execution prompts are in [`/prompts`](./prompts/).

**Current phase: Phase 14 — Full End-to-End Dry Run** (Phases 0–13 complete)

## Security

- Never commit `.env`, browser profiles, tokens, or OAuth credentials.
- Keep `SUPABASE_SERVICE_ROLE_KEY` out of all browser-accessible code.
- Playwright session profiles must live in `playwright-profiles/` (gitignored).
- All secrets use `REPLACE_ME` placeholders in `.env.example`.

## Author

Atharva (Techno)
