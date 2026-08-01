---
subtitle: "Tech Stack and Infrastructure Specification"
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

# Tech Stack and Infrastructure Specification

## Document control

| Field | Value |
|---|---|
| Project name | Project AP-I |
| Developer | Atharva (Techno) |
| Document | Tech Stack and Infrastructure Specification |
| Version | 1.1 |

## Current infrastructure constraints (local MVP)

MVP runs on the **local developer machine** (Windows). Hostinger VPS deployment is deferred.

Typical local dev constraints:

```text
Host: Windows laptop/desktop
Worker: Docker (infra/docker-compose.yml) or native Node
n8n: Docker on localhost:5678
Web: Next.js dev server on localhost:3000
Supabase: hosted cloud project
Playwright: real Chrome profiles under playwright-profiles/ (gitignored)
```

The local machine is sufficient for MVP if FFmpeg is limited to one active process at a time and temporary files are cleaned aggressively. See `LOCAL_DEVELOPMENT.md` for setup.

## Recommended stack overview

| Layer | Recommended choice | Reason |
|---|---|---|
| Frontend | Next.js on Vercel | Fast deployment, good server actions/API routes, free tier friendly |
| UI | Tailwind CSS + shadcn/ui | Clean dashboard UI, fast component development |
| Auth | Supabase Auth | Integrated with Supabase RLS and user roles |
| Database | Supabase Postgres | Source of truth for jobs, mappings, logs |
| Automation | n8n self-hosted | Visual orchestration and scheduling |
| Worker | Python FastAPI or Node.js | Heavy processing and platform modules |
| Video download | yt-dlp | Practical open-source downloader for supported sources |
| Video processing | FFmpeg | Industry-standard video processing |
| Browser automation | Playwright | MVP uploading where official APIs are not used |
| Staging storage | Google Drive API | Uses existing 2 TB Drive storage |
| AI metadata | Google Gemini 3.5 Flash primary + Groq fallback (OpenRouter optional) | Replaceable provider design |
| Runtime | Docker Compose | Isolation, resource limits, repeatable deployment |
| Monitoring | Dashboard + logs + n8n execution history | Low-cost MVP observability |

## Frontend technology

### Framework

Use Next.js App Router.

Recommended structure:

```text
apps/web
  app/
    (auth)/login/page.tsx
    submit/page.tsx
    admin/page.tsx
    admin/jobs/page.tsx
    admin/failed/page.tsx
    admin/accounts/page.tsx
    admin/settings/page.tsx
  components/
  lib/
  server/
```

Why Next.js:

- Works well on Vercel.
- Supports server actions and route handlers.
- Can protect server-side admin operations.
- Easy integration with Supabase client libraries.

### Styling

Use Tailwind CSS with shadcn/ui components.

Recommended UI tone:

- Minimal dashboard.
- White/light mode first.
- High contrast status badges.
- Mobile-friendly submission page.
- Desktop-first admin dashboard.

### Frontend state

Use server-side data fetching where possible. For interactive admin tables, use React state and TanStack Table only if needed.

Avoid overengineering with Redux/Zustand for MVP.

## Backend technology

### Worker language choice

Two practical options:

#### Option A: Python FastAPI

Pros:

- Excellent for subprocess orchestration.
- Easy FFmpeg and yt-dlp process handling.
- Strong Google API client support.
- Good for AI API calls.

Cons:

- Playwright Python works, but many examples are JS-first.

#### Option B: Node.js/TypeScript

Pros:

- Same language as frontend.
- Playwright has excellent TypeScript support.
- Easy monorepo sharing of types.

Cons:

- FFmpeg/yt-dlp orchestration is also fine, but process handling can get messy.

### Recommendation

Use **Node.js/TypeScript worker** if Cursor coding simplicity and Playwright integration are the priority.

Use **Python FastAPI worker** if video-processing reliability and subprocess control are the priority.

For this project, recommended MVP choice:

```text
Frontend: Next.js TypeScript
Worker: Node.js TypeScript
Automation: n8n
```

Reason: one language across Vercel web app, shared types, and Playwright uploaders.

## Monorepo structure

Recommended repository:

```text
project-ap-i/
  apps/
    web/
    worker/
  packages/
    shared/
      types/
      validation/
      constants/
  infra/
    docker-compose.yml
    nginx/
    n8n/
  docs/
  scripts/
  .env.example
  README.md
```

## Worker modules

```text
apps/worker/src/
  index.ts
  config.ts
  server.ts
  db/
    supabaseAdmin.ts
    jobsRepo.ts
  jobs/
    claimJob.ts
    processJob.ts
    verifyJob.ts
    retryJob.ts
  downloaders/
    ytdlpDownloader.ts
  processors/
    ffmpegProcessor.ts
  storage/
    googleDriveStorage.ts
  ai/
    metadataGenerator.ts
  uploaders/
    youtubePlaywrightUploader.ts
    instagramPlaywrightUploader.ts
    uploaderTypes.ts
  security/
    validateUrl.ts
    authMiddleware.ts
  logs/
    logger.ts
```

## Local Docker Compose design

See `infra/docker-compose.yml` in the repo. Recommended services:

```yaml
services:
  n8n:
    image: n8nio/n8n:latest
    restart: unless-stopped
    env_file: .env
    volumes:
      - ./n8n_data:/home/node/.n8n
    ports:
      - "5678:5678"

  worker:
    build: ../apps/worker
    restart: unless-stopped
    env_file: .env
    volumes:
      - ./tmp/jobs:/app/tmp/jobs
      - ./assets:/app/assets:ro
      - ./playwright-profiles:/app/playwright-profiles
      - ./logs:/app/logs
    deploy:
      resources:
        limits:
          cpus: "1.50"
          memory: 4096M
```

For plain Docker Compose, `deploy.resources` may not enforce limits unless using swarm. Prefer explicit runtime flags or Compose resource fields supported by your Docker version. At minimum, enforce concurrency in application code.

## Local folder layout

```text
<repo-root>/
  .env
  infra/docker-compose.yml
  playwright-profiles/     ← gitignored, outside committed tree
  apps/worker/assets/bgm/absolutesound-background-guitar-no-copyright-561871.mp3
  tmp/jobs/                ← native worker temp (optional)
```

When using Docker, mount volumes as defined in `infra/docker-compose.yml`. Paths like `/opt/project-ap-i` in older docs map to `<repo-root>` for local MVP.

## Environment variables

### Vercel frontend

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=server-only if using server routes carefully
APP_BASE_URL=
```

If using Vercel server routes to create jobs, the service role key may be placed in Vercel sensitive environment variables, but it must never be exposed to client bundles. If a browser can read it, the design is broken.

### Worker (local)

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
WORKER_INTERNAL_TOKEN=
GOOGLE_DRIVE_CLIENT_ID=
GOOGLE_DRIVE_CLIENT_SECRET=
GOOGLE_DRIVE_REFRESH_TOKEN=
GOOGLE_DRIVE_ROOT_FOLDER_ID=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash
GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_BASE_URL=https://api.groq.com/openai/v1
AI_MODEL=
BACKGROUND_MUSIC_PATH=/app/assets/bgm/absolutesound-background-guitar-no-copyright-561871.mp3
TMP_DIR=/app/tmp/jobs
MAX_FFMPEG_CONCURRENCY=1
MAX_DOWNLOAD_CONCURRENCY=2
VERIFY_DELAY_MINUTES=30
```

### n8n (local Docker)

```text
N8N_ENCRYPTION_KEY=
N8N_HOST=
N8N_PROTOCOL=https
WEBHOOK_URL=
WORKER_BASE_URL=
WORKER_INTERNAL_TOKEN=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

## Dependencies

### Frontend

```text
next
react
react-dom
typescript
@supabase/supabase-js
@supabase/ssr
zod
tailwindcss
shadcn/ui
lucide-react
tanstack-table optional
```

### Worker

```text
typescript
ts-node or tsx
express or fastify
zod
@supabase/supabase-js
googleapis
playwright
execa or child_process wrapper
pino
p-limit
```

### System packages in worker image

```text
ffmpeg
yt-dlp
chromium dependencies for Playwright
python3 if yt-dlp installed through pipx/pip
```

## Processing capacity estimate

Assumptions:

- Short videos under 60 seconds.
- 1080x1920 vertical MP4 output.
- One FFmpeg process at a time.
- 4 to 5 videos/day normal.
- 8 videos/day exceptional.

Expected behavior:

- Local host should handle this under controlled queue limits.
- CPU spikes are acceptable if concurrency is one.
- Disk usage should remain low because local temp files are deleted after Drive upload.

Recommended safety limits:

```text
Max temp folder size before pausing queue: 30 GB
Max single source video size: 500 MB MVP
Max processed output size: 500 MB MVP
Max source duration: 180 seconds MVP
Max processing time per job: 45 minutes
```

## Google Drive integration

Use resumable uploads for videos. The Drive API documentation recommends resumable uploads for files larger than 5 MB and unreliable network conditions. The worker should store `drive_file_id` in Supabase immediately after upload succeeds.

Recommended Drive structure:

```text
/ReelBot
  /processed_ready
  /failed_manual_review
  /deleted_log_optional
```

## n8n hosting notes

For MVP, existing single n8n deployment can remain.

When scaling:

```text
n8n main instance
Redis
n8n worker instance(s)
```

n8n's official queue mode uses worker instances to handle executions and scale the workload. Queue mode is a future stabilization step, not necessary for day one.

## Why not Supabase Storage in MVP

Supabase Storage would be cleaner for app-level storage, but the user already has 2 TB Google Drive and wants minimal added cost. Drive is acceptable for staging as long as Supabase stores metadata.

## Why not official upload APIs in MVP

Official APIs are better long term. However:

- YouTube API upload flows can be affected by project verification/audit behavior.
- Instagram publishing APIs require professional account setup and Meta app permission work.
- The MVP needs fast validation with new accounts.

Therefore:

```text
MVP uploader: Playwright
Future uploader: official APIs where practical
```

## Technology risk table

| Technology | Risk | Mitigation |
|---|---|---|
| Playwright | UI changes/session expiry | Persistent profiles, login health checks, manual recovery |
| yt-dlp | Sites change and break extractors | Keep updated, fallback to manual review |
| FFmpeg | CPU spikes | Concurrency = 1, timeouts |
| Google Drive | API/token errors | Refresh token handling, retry, logs |
| Supabase free tier | Limits | Keep job volume low, avoid storing video files |
| Vercel free tier | Serverless limits | Keep heavy tasks off Vercel |
| n8n | Workflow complexity | Use n8n as orchestrator only |

## Final stack recommendation

```text
Frontend: Next.js + TypeScript + Tailwind + shadcn/ui on Vercel
Database/Auth: Supabase Postgres + Supabase Auth + RLS
Automation: n8n self-hosted locally (Docker)
Worker: Node.js TypeScript Docker service
Video: yt-dlp + FFmpeg
Storage: Google Drive API with resumable upload
Upload MVP: Playwright with persistent browser profiles
AI metadata: configurable OpenAI-compatible provider
Deployment: Docker Compose on Ubuntu 24.04
```

## Finalized niche configuration

The MVP niche list is now finalized as:

| Niche | YouTube target | Instagram target | Selection method | Notes |
|---|---|---|---|---|
| Memes | One mapped YouTube account | One mapped Instagram account | Submitter selects `Memes` | Short humor, trends, relatable clips, creator-approved meme content. |
| Anime | One mapped YouTube account | One mapped Instagram account | Submitter selects `Anime` | Anime edits, commentary, anime-related short clips, creator-approved source content. |
| Sports | One mapped YouTube account | One mapped Instagram account | Submitter selects `Sports` | Sports highlights/commentary-style clips where the agency has permission to republish. |

Rules:

1. Every niche maps to exactly one YouTube account and exactly one Instagram account.
2. Submitters do not manually choose platform accounts.
3. The selected niche resolves the target accounts.
4. The same processed video is uploaded to both the mapped YouTube account and the mapped Instagram account.
5. No AI niche classification is used in MVP. The submitter is responsible for selecting the correct niche.
6. If the niche is wrong, the job must be corrected from the admin dashboard before processing, or manually fixed before retry.

# References

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
- yt-dlp supported sites notes: <https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md>
- Playwright authentication state documentation: <https://playwright.dev/docs/auth>
- Vercel sensitive environment variable documentation: <https://vercel.com/docs/environment-variables/sensitive-environment-variables>
