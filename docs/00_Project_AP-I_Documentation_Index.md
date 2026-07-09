---
subtitle: "Documentation Index"
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

# Project AP-I Documentation Index

## Project information

| Field | Value |
|---|---|
| Project name | Project AP-I |
| Developer | Atharva (Techno) |
| Purpose | Client-approved short-form content intake, processing, and publishing system |
| Finalized niches | Memes, Anime, Sports |
| Primary stack | Local Next.js + Docker (worker/n8n), Supabase, Google Drive, Playwright, yt-dlp, FFmpeg |
| Target MVP volume | 4 to 5 videos per day, with occasional 8-link queue days |

## Version 1.2 update summary (local-first MVP)

**Deployment decision:** MVP runs on the **local developer machine** (Windows). Hostinger VPS deployment is deferred until after Phase 16. See `LOCAL_DEVELOPMENT.md` for the canonical local runbook.

Changes from v1.1:

1. Worker and n8n run via `infra/docker-compose.yml` on localhost (ports 3001, 5678).
2. Playwright profiles live at `<repo-root>/playwright-profiles/` (gitignored), not `/opt/project-ap-i/`.
3. Phase 15 smoke test runs locally with explicit `.env` flags — not on a remote VPS.
4. `docs/09` retains a **Future VPS deployment** appendix for when remote hosting is needed.

## Version 1.1 update summary

This pack updates the original Project AP-I documentation with the finalized niche model and replaces the earlier Cursor implementation plan with a stricter Cursor build system:

1. Finalized niches are `Memes`, `Anime`, and `Sports`.
2. Every niche maps to exactly one YouTube account and one Instagram account.
3. The submitter form remains minimal: link, platform, niche, rights confirmation, submit.
4. No manual target-account selector is exposed to submitters.
5. No burned-in subtitles are required; Instagram caption means post text/description only.
6. Failed twice-uploaded jobs remain in Google Drive until admin cleanup.
7. New `.cursorrules` file is included for strict implementation and testing behavior.
8. New Cursor execution plan and phase-based delivery plan are included.

## Document set

1. `01_PRD_Project_AP-I` - Product requirements, finalized niches, feature scope, non-goals, and acceptance criteria.
2. `02_System_Architecture_Project_AP-I` - System architecture, components, worker orchestration, state machine, and scaling path.
3. `03_Tech_Stack_Infrastructure_Project_AP-I` - Stack choices, local host constraints, environment variables, and infrastructure plan.
4. `LOCAL_DEVELOPMENT` - **Start here for local MVP** — setup, daily workflow, troubleshooting.
5. `04_Frontend_Specification_Project_AP-I` - Submitter UI, admin dashboard, UX, frontend routes, and client validation.
6. `05_Backend_Worker_Specification_Project_AP-I` - Worker API, download, FFmpeg, Drive, AI metadata, and Playwright upload modules.
7. `06_N8N_Workflow_Specification_Project_AP-I` - n8n workflows, polling, verification, retry, and orchestration rules.
8. `07_Database_Storage_Design_Project_AP-I` - Supabase schema, seed data, indexes, RLS overview, and Google Drive lifecycle.
9. `08_Authentication_Security_Project_AP-I` - Auth model, roles, secrets, URL security, RLS, and incident response.
10. `09_Deployment_Operations_Runbook_Project_AP-I` - Deployment setup, health checks, monitoring, failures, and launch plan.
11. `10_Cursor_Rules_Project_AP-I` - Human-readable version of the Cursor rules, matching the included `.cursorrules` file.
12. `11_Cursor_Detailed_Execution_Plan_Project_AP-I` - Cursor-friendly implementation sequence, prompts, commands, checkpoints, and bug-fix loop.
13. `12_Phase_Based_Delivery_Plan_Project_AP-I` - Highly detailed phased delivery plan with completion tests and usability checks.

## Included non-PDF control file

The pack also includes:

```text
.cursorrules
```

This file should be placed at the root of the repository before building with Cursor. It is not only a documentation file; it is a working instruction file for Cursor.

## Recommended reading order

```text
01 PRD
02 Architecture
03 Tech Stack
07 Database
08 Security
04 Frontend
05 Backend Worker
06 n8n Workflows
09 Operations
10 Cursor Rules
11 Cursor Detailed Execution Plan
12 Phase-Based Delivery Plan
.cursorrules
```

## MVP architecture in one paragraph

Project AP-I runs a Next.js web app (local dev on localhost:3000; optional Vercel deploy later) backed by Supabase Auth and Postgres. Submitters create queued jobs by pasting client-approved YouTube/Instagram links, choosing one of the three finalized niches, and confirming rights. n8n on the local machine (Docker, localhost:5678) polls for queued jobs and calls a worker API (localhost:3001). The worker downloads approved content, applies the FFmpeg preset, stages the edited file in Google Drive, generates metadata, uploads to the niche-mapped YouTube and Instagram accounts through Playwright MVP uploaders, verifies after roughly 30 minutes, deletes staged files on success, and keeps twice-failed files for manual admin cleanup.

## Finalized niche routing

| Niche | Target YouTube | Target Instagram | Submitter selection | Upload behavior |
|---|---|---|---|---|
| Memes | Exactly one mapped account | Exactly one mapped account | Manual dropdown | Same processed video uploads to both. |
| Anime | Exactly one mapped account | Exactly one mapped account | Manual dropdown | Same processed video uploads to both. |
| Sports | Exactly one mapped account | Exactly one mapped account | Manual dropdown | Same processed video uploads to both. |

## References

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
- Playwright authentication state documentation: <https://playwright.dev/docs/auth>
- Vercel sensitive environment variable documentation: <https://vercel.com/docs/environment-variables/sensitive-environment-variables>
