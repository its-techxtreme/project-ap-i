# Project AP-I

Project AP-I is a client-approved short-form content intake, processing, and publishing system. It accepts submitted video links from a simple form, processes each video (speed adjustment, watermarking), and automatically uploads the result to both YouTube and Instagram for the appropriate niche account. The system is built for reliability, auditability, and safe defaults — real uploads are disabled by default.

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
    web/        — Next.js (App Router) frontend on Vercel
    worker/     — Node.js/TypeScript backend worker on VPS (Docker)
  packages/
    shared/     — Shared constants, schemas, status enums, validation helpers
  supabase/
    migrations/ — Supabase SQL migrations (source of truth for schema)
    seed.sql    — Seed data for niches and system settings
  infra/
    docker-compose.yml    — VPS service orchestration (worker + n8n)
    nginx.example.conf    — Reverse proxy example
  scripts/      — Utility scripts
  docs/         — Full project documentation
  prompts/      — Phase-by-phase Cursor execution prompts
```

## Prerequisites

- Node.js >= 20.0.0
- pnpm >= 9.0.0
- Docker (for local worker development and VPS deployment)

## Install

```bash
pnpm install
```

## Run All Checks

```bash
pnpm check
# runs: pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Safe MVP Behavior

**Real uploads are disabled by default.** The following environment variables must all remain `false` in development, test, and CI:

```
REAL_UPLOADS_ENABLED=false
YOUTUBE_UPLOADS_ENABLED=false
INSTAGRAM_UPLOADS_ENABLED=false
```

Only set these to `true` in a production-approved environment after a controlled smoke test.

## Documentation

All design documents are in [`/docs`](./docs/):

| # | Document |
|---|----------|
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

Current phase: **Phase 0 — Repository Bootstrap**

## Security

- Never commit `.env`, browser profiles, tokens, or OAuth credentials.
- Keep `SUPABASE_SERVICE_ROLE_KEY` out of all browser-accessible code.
- Playwright session profiles must live outside the repository with strict filesystem permissions.
- All secrets use `REPLACE_ME` placeholders in `.env.example`.

## Author

Atharva (Techno)
