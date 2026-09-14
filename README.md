# Project AP-I

**Short-form intake → process → publish**  :D

Basciallyy this is the queue I wish I had before I spent every evening pasting the same reel into YouTube Studio and Instagram for three niches. You drop an approved link, pick Memes / Anime / Sports, tick rights, walk away. Worker on my laptop does download, 1.2x edit, Drive, captions, then both platforms. If the PC sleeps the queue sleeps. ugly but it ships. +_=

![Stretch](apps/web/public/pirate/crew-stretch.svg)![Navi](apps/web/public/pirate/crew-navigator.svg)![Cookie](apps/web/public/pirate/crew-cook.svg)![Blades](apps/web/public/pirate/crew-blades.svg)![Doc](apps/web/public/pirate/crew-bird.svg)

![compass](apps/web/public/pirate/compass.svg)![anchor](apps/web/public/pirate/anchor.svg)![map scroll](apps/web/public/pirate/map-scroll.svg)

Niches are locked: **memes / anime / sports**. Each one maps server-side to exactly one YT + one IG. Submitters never pick accounts. Collector IG (same worker, different Chrome, never uploads) searches 3 unique reels per niche then unread DMs, twice a local day max. Missing niche words go to Unsorted cargo. sooo much less paste-by-hand now. :)


|               |                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------- |
| **Live**      | [ap-i.techxtreme.me](https://ap-i.techxtreme.me)                                         |
| **Also**      | [project-ap-i.vercel.app](https://project-ap-i.vercel.app)                               |
| **Repo**      | [github.com/its-techxtreme/project-ap-i](https://github.com/its-techxtreme/project-ap-i) |
| **Stardance** | [stardance.hackclub.com/projects/33973](https://stardance.hackclub.com/projects/33973)   |


---

## Why this exists

Manual short-form ops looks simple until you do it every day:

1. Find an approved Reel or Short
2. Download it
3. Apply the edit preset (1.2x speed, stronger filter, quiet BGM bed)
4. Write a YouTube title/description and an Instagram caption
5. Upload to the niche’s YouTube account (brand c-text when reel has no hard captions)
6. Upload again to the niche’s Instagram account (shared edit export)
7. Remember which jobs failed, which need retry, and which Drive files still need cleanup

Miss a step and you lose an evening. Project AP-I replaces that loop with a job queue: **submit → download → FFmpeg edit → titles/captions → Google Drive staging → YouTube + Instagram upload → verification → Drive cleanup**. Status, retries, and audit logs live in Supabase so you can see what happened without digging through browser tabs.

The public web app runs on Vercel. The heavy work (yt-dlp, FFmpeg, Playwright with real Chrome profiles) runs on a local laptop by design — a full always-on VPS with headed Chrome was not a realistic budget for this MVP. ywahh the factory is under the desk. :-}

---

## What's on the desk rn

Captain's Deck UI (Crow's nest, Ship's log, Lost cargo, Crew, Sea lanes, Unsorted cargo). Demo watch is read-only. Remote laptop light is a Supabase heartbeat because Vercel cannot ping the worker. Collector fail-closes if settings / known urls cannot load. Fake ig-job ids do not count as uploaded. Daily-limit parked jobs drop the stuck badge after the 24h window. YT overlay labels: ShonenSnaps / CrackleCrumb / ScoreMorsel. Anime handles are `theshonensnaps` on both platforms. nott gonna pretend it is bug-free. T_T

---

## Try the demo (no local setup)

You do not need to clone the repo to see how the product looks and behaves. tysmmmm if you actually click around. =_=

1. Open **[https://ap-i.techxtreme.me](https://ap-i.techxtreme.me)** (or [vercel](https://project-ap-i.vercel.app)) and go to **Login**. ;)
2. Click **Demo voyage — board & tour** — no typing needed. You land on a read-only Captain's Deck session and the crew runs an interactive briefing (spotlight + mascots).
3. Optional manual login (same demo account):


| Field    | Value            |
| -------- | ---------------- |
| Username | `ProjectAPIDemo` |
| Password | `ProjectAPI@13`  |


Use **Demo · replay tour** in the top bar anytime to restart the briefing.

**What the demo user can do**

- View the admin overview, jobs queue, failed / needs-review tables, and account health views  
- Navigate the same UI an operator would use day to day

**What the demo user cannot do**

- Retry jobs, delete Drive files, ignore failures, or change account settings  
- Trigger any worker-side destructive action

That keeps the hosted dashboard useful for reviewers while protecting the live queue. Real uploads still require a machine running the worker and n8n with Chrome profiles — those never run on Vercel.

---

## Architecture (at a glance)


| Piece                      | Role                                                                         | Typical URL                                    |
| -------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------- |
| **Web** (`apps/web`)       | Submit form + admin dashboard (Next.js)                                      | [http://localhost:3000](http://localhost:3000) |
| **Worker** (`apps/worker`) | Download, FFmpeg, Drive, captions, Playwright uploads + collector harvest | [http://localhost:3001](http://localhost:3001) |
| **n8n** (Docker)           | Claims jobs on a schedule and calls the worker                               | [http://localhost:5678](http://localhost:5678) |
| **Supabase**               | Source of truth for jobs, niches, accounts, audit logs                       | your cloud project                             |
| **Google Drive**           | Staging for processed videos before / after upload                           | OAuth in local `.env`                          |


**Recommended local run:** native worker on the host (needs Chrome) + n8n in Docker via `pnpm stack:up`.

```text
Submitter  →  Vercel / local Next.js  →  Supabase (job queued)
                                              ↓
                                    n8n poller (WF-01…)
                                              ↓
                                    Worker on your laptop
                         download → edit (1.2x + filter + BGM) → Drive → captions → upload
                         (YT: brand c-text if no hard captions; IG: shared export)
                                              ↓
                                    verify (~5 min) → cleanup
```

---

## Acknowledgments

Parts of this codebase were written and iterated with **[Cursor](https://cursor.com)**, an AI-assisted editor. Cursor was used for debugging pipeline edge cases, writing tests, and tightening ops scripts. Product decisions, architecture tradeoffs, deployment choices, and final review remain mine in those cases too.

The product also calls Google Gemini (with Groq fallback) to generate YouTube titles/descriptions and Instagram captions from source context, with a plain fallback when models are unavailable.

---

## Prerequisites

Install these before the first local setup:

1. **Node.js 20+** and **pnpm 9+** (`corepack enable` then `corepack prepare pnpm@9.0.0 --activate` works well)
2. **Docker Desktop** (n8n runs in Docker; leave Docker running while you use the stack)
3. **FFmpeg** and **yt-dlp** on your PATH (native worker)
4. **Google Chrome** (required for real Playwright uploads; bundled Chromium alone is not enough for the profile setup we use)
5. A **Supabase** project where you can run SQL migrations

Optional for a full end-to-end pipeline:

- Google Cloud OAuth client for Drive (see `[infra/google-drive/SETUP.md](./infra/google-drive/SETUP.md)`)  
- A Gemini API key for captions (Groq key recommended as free-tier fallback; see `.env.example`)  
- Platform accounts you are allowed to automate (never commit passwords or cookies)

**Platform note:** The MVP runbook assumes **Windows**. Linux/macOS can work for web + Docker n8n, but Playwright profile paths and Chrome channel settings are documented for Windows first.

---

## First-time setup on your laptop

Follow these steps in order. Skipping ahead usually ends in “queue looks fine but nothing moves.”

### 1. Clone and install

```bash
git clone https://github.com/its-techxtreme/project-ap-i.git "Project AP-I"
cd "Project AP-I"
pnpm install
```

### 2. Create environment files

```bash
cp .env.example .env
cp .env.example apps/web/.env.local
```

Fill the values you actually need. At minimum for web + worker + n8n talking to the same project:


| Variable                        | Where                          | Notes                                                                 |
| ------------------------------- | ------------------------------ | --------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | `.env` + `apps/web/.env.local` | Supabase project URL                                                  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env` + `apps/web/.env.local` | Public anon key                                                       |
| `SUPABASE_URL`                  | `.env`                         | Same URL (worker / n8n)                                               |
| `SUPABASE_SERVICE_ROLE_KEY`     | `.env` (+ web server env)      | **Server only** — never put this in client code                       |
| `WORKER_INTERNAL_TOKEN`         | `.env`                         | Random secret, **≥ 32 characters**, identical everywhere              |
| `N8N_WEBHOOK_TOKEN`             | `.env`                         | Used by webhook workflows (WF-04 / WF-05)                             |
| `ADMIN_USERNAME`                | web env                        | Your real admin login                                                 |
| `ADMIN_PASSWORD_HASH`           | web env                        | Generate with the hash script below — never store plaintext on Vercel |
| `ADMIN_SESSION_SECRET`          | web env                        | Random string, **≥ 32 characters**                                    |


Generate a password hash (put the plaintext in `.env` temporarily as `ADMIN_PASSWORD`, or pass it as an argument — see the script):

```bash
node --env-file=.env scripts/hash-admin-password.mjs
```

Then generate safe local defaults (localhost URLs, n8n encryption key, upload flags forced off):

```bash
pnpm setup:local-env
```

**Do not commit** `.env`, `apps/web/.env.local`, Playwright profiles, or OAuth tokens.

### 3. Apply the database

Run every file under `supabase/migrations/` against your Supabase project (CLI, SQL editor, or your preferred tooling), in numeric order through the latest migration (currently includes claim / lock / daily-limit fixes such as `0015`–`0018`).

If the project is empty, also load niches / baseline rows from `supabase/seed.sql`.

Confirm in the Supabase table editor that niches exist with slugs `memes`, `anime`, and `sports`, and that each niche has exactly one active YouTube and one active Instagram account row when you intend to upload for real.

### 4. Start n8n + the native worker

```bash
pnpm stack:up
pnpm stack:status
```

This frees port **3001** if needed, starts Docker **n8n**, and launches the **native worker** on the host.


| Check         | URL                                                          |
| ------------- | ------------------------------------------------------------ |
| Worker health | [http://127.0.0.1:3001/health](http://127.0.0.1:3001/health) |
| n8n editor    | [http://localhost:5678](http://localhost:5678)               |


Leave Docker Desktop running. If the laptop sleeps, the queue sleeps — that is expected for this architecture.

### 5. Configure n8n and import workflows (first time only)

n8n only orchestrates. It does not run FFmpeg, yt-dlp, or Playwright. Ready-to-import JSON exports live in `[infra/n8n/workflows/](./infra/n8n/workflows/)` — they reference credential **names** and env vars only, never your private tokens.

#### 5a. Owner account + Header Auth credentials

1. Open [http://localhost:5678](http://localhost:5678) and create the local owner account.
2. Confirm `N8N_ENCRYPTION_KEY` was set in `.env` **before** you save credentials (otherwise later restarts cannot decrypt them).
3. Create these Header Auth credentials under **Settings → Credentials** (names must match exactly):


| Credential name        | Header            | Value                                     |
| ---------------------- | ----------------- | ----------------------------------------- |
| `WorkerToken`          | `X-Worker-Token`  | same as `WORKER_INTERNAL_TOKEN` in `.env` |
| `WebhookInternalToken` | `X-Webhook-Token` | same as `N8N_WEBHOOK_TOKEN` in `.env`     |


More detail: `[infra/n8n/credentials_setup.md](./infra/n8n/credentials_setup.md)`.

#### 5b. Import the workflow JSON files

**Option A — n8n UI (simplest)**

1. In n8n: **Workflows → Import from File**
2. Import each file from `infra/n8n/workflows/`:


| File                               | What it does                                      |
| ---------------------------------- | ------------------------------------------------- |
| `WF-01_new_job_poller.json`        | Every ~2 min: claim one queued job → run WF-02    |
| `WF-02_process_job.json`           | Process → upload → wait → run WF-03               |
| `WF-03_upload_verification.json`   | Verify uploads; retry or flag manual review       |
| `WF-04_manual_retry_webhook.json`  | Optional local manual-retry webhook               |
| `WF-05_drive_cleanup_webhook.json` | Optional local Drive cleanup webhook              |
| `WF-06_account_health_check.json`  | Optional account health checks                    |
| `WF-07_admin_command_poller.json`  | Drain hosted admin retry/delete commands          |
| `WF-08_verification_cron.json`     | Verify due jobs if the WF-02 wait was interrupted |


1. Open an imported HTTP Request node and confirm it still points at `WorkerToken` / `WebhookInternalToken` by name. If n8n shows a missing credential warning, pick the credential you created in 5a.
2. Wire sub-workflows (or let the CLI do it in Option B):
  - In **WF-01** → node **Run WF-02 Process Job** → select workflow **WF-02 Process Job**
  - In **WF-02** → node **Run WF-03 Verify** → select workflow **WF-03 Upload Verification**
3. Activate at least **WF-01**, **WF-07**, and **WF-08**. Activating WF-02 / WF-03 as well is recommended so nested calls stay published.

**Option B — CLI (after you create an n8n API key)**

1. In n8n: **Settings → API** → create a key → put it in `.env` as `N8N_API_KEY`
2. From the repo root:

```bash
pnpm n8n:import   # upserts all JSON files from infra/n8n/workflows/
pnpm n8n:setup    # attaches credentials, links WF-01→02→03, activates pollers
```

Folder notes and a security checklist for the exports: `[infra/n8n/workflows/README.md](./infra/n8n/workflows/README.md)`. Full workflow map: `[infra/n8n/README.md](./infra/n8n/README.md)`.

n8n inside Docker must call the host worker at:

```text
http://host.docker.internal:3001
```

(`pnpm stack:up` sets this for the canonical stack.)

If you change workflows in the n8n UI and want the repo copies refreshed (still stripped of secrets), run `pnpm n8n:export` while n8n is up.

### 6. Start the web app

In a second terminal:

```bash
pnpm --filter @project-api/web dev
```


| Route                                                        | Purpose                       |
| ------------------------------------------------------------ | ----------------------------- |
| [http://localhost:3000](http://localhost:3000)               | Landing / submit entry        |
| [http://localhost:3000/submit](http://localhost:3000/submit) | Public submit form            |
| [http://localhost:3000/admin](http://localhost:3000/admin)   | Admin dashboard (after login) |
| [http://localhost:3000/login](http://localhost:3000/login)   | Admin / demo login            |


### 7. Google Drive + titles/captions (full pipeline)

- **Drive:** follow [infra/google-drive/SETUP.md](./infra/google-drive/SETUP.md), then put client id, secret, refresh token, and folder IDs in `.env`. Helper scripts include `scripts/google-drive-ensure-folders.mjs` and `apps/worker/scripts/drive-oauth-via-profile.mjs`.
- **Titles / captions:** set `GEMINI_API_KEY` (primary) and `GROQ_API_KEY` (fallback) in `.env`. Without those keys, the worker falls back to cleaned source caption text plus niche tags. More in [docs/captions.md](./docs/captions.md).

### 8. Playwright profiles (only when enabling real uploads)

Profiles live in `playwright-profiles/` at the repo root (gitignored). Log in once per niche/platform profile, for example:

```bash
pnpm --filter @project-api/worker smoke:playwright -- --login --profile memes-yt
```

Repeat for each profile you use (`memes-ig`, `anime-yt`, …). Complete any 2FA yourself in the opened Chrome window. **Never commit** that folder.

Watermarking is intentionally disabled. Background music for the edit preset lives under `apps/worker/assets/bgm/` (override with `BACKGROUND_MUSIC_PATH`).

---

## Daily use

```bash
pnpm stack:up
pnpm stack:status
pnpm --filter @project-api/web dev

# when finished for the day
pnpm stack:down
```

Optional Windows logon autostart (current user only, no admin elevation):

```bash
pnpm stack:autostart:install
```

After login, once Docker is ready, n8n + worker come up on their own. Extra notes: [docs/setup.md](./docs/setup.md).

---

## Real uploads (opt-in, local only)

Keep these **false** unless you are deliberately smoke-testing on a machine you control:

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

Restart with `pnpm stack:up`. Turn the flags back to `false` afterward. Never enable real uploads in CI or on Vercel. The worker will refuse real uploads without `PLAYWRIGHT_CHANNEL=chrome`.

Concurrency on a typical laptop should stay conservative (`MAX_FFMPEG_CONCURRENCY=1`). Daily successful uploads per platform account are capped by `DAILY_UPLOAD_LIMIT_PER_ACCOUNT` (default 5, rolling 24 hours).

---

## Niches and accounts


| Niche  | Slug     | Accounts                                      |
| ------ | -------- | --------------------------------------------- |
| Memes  | `memes`  | Exactly 1 active YouTube + 1 active Instagram |
| Anime  | `anime`  | Exactly 1 active YouTube + 1 active Instagram |
| Sports | `sports` | Exactly 1 active YouTube + 1 active Instagram |


If mapping is wrong or incomplete, jobs move to `needs_manual_review` instead of guessing an account.

---

## Troubleshooting

Things that commonly go wrong when setting this up on a laptop, and how to recover.

### Stack will not start


| Symptom                         | Likely cause                                        | What to do                                                                                               |
| ------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `pnpm stack:up` fails on Docker | Docker Desktop not running                          | Start Docker, wait until it is healthy, retry                                                            |
| Port 3001 already in use        | Old worker still running                            | `pnpm stack:down`, then `pnpm stack:up` again                                                            |
| Worker health never goes green  | Bad `.env` or missing build                         | Check `.stack-worker` / terminal logs; confirm `WORKER_PORT=3001` and Supabase keys                      |
| n8n UI blank / restart loop     | Encryption key changed after credentials were saved | Restore the original `N8N_ENCRYPTION_KEY`, or wipe the n8n volume and recreate credentials (last resort) |


### Queue looks alive but nothing processes


| Symptom                               | Likely cause                                            | What to do                                                                                                                                          |
| ------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jobs stay `queued` forever            | WF-01 not **Active**, or n8n cannot reach the worker    | Activate WF-01; confirm `WORKER_BASE_URL=http://host.docker.internal:3001` inside the n8n container; `pnpm n8n:setup` if credentials drifted        |
| Worker returns 401                    | Token mismatch                                          | `WORKER_INTERNAL_TOKEN` in `.env` must match the n8n `WorkerToken` credential exactly                                                               |
| Claim never picks healthy jobs        | Stale SQL / null `failure_code` edge cases on older DBs | Apply migrations through `0018_fix_claim_null_failure_code.sql`                                                                                     |
| Entire pipeline frozen                | Crash left a job stuck in `uploading`                   | Newer worker recovers stale uploads on the next claim; check admin Failed / Needs review; use admin retry after the outbox poller (WF-07) is active |
| Dashboard says Processing, logs quiet | Pollers inactive or worker asleep                       | `pnpm stack:status`; reopen n8n and confirm Active workflows; wake the laptop                                                                       |


### Uploads and sessions


| Symptom                                               | Likely cause                                                        | What to do                                                                                                                                                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Job flips to `login_required` while you are logged in | YouTube Studio security / 2FA *upsell* banners, or a real challenge | Re-run profile login; complete real 2FA yourself — never automate CAPTCHA/2FA; if Studio shows Create and you are not on an auth URL, treat soft banners as noise (detector was hardened for this) |
| Video is live but job says failed                     | Share-URL scrape missed `youtu.be` / Studio dialog DOM              | Re-run verify / retry upload path; check worker logs for share capture                                                                                                                             |
| Instagram hangs mid-upload                            | Playwright stall or Chrome profile issue                            | Upload platform timeout should mark the platform failed; restart worker; re-login IG profile if needed                                                                                             |
| `login_required` retry does nothing                   | Platform not treated as retryable on older builds                   | Use a current worker; retry should re-attempt YouTube when Instagram already succeeded                                                                                                             |
| Daily limit messages / jobs stay `ready_to_upload`    | Hit `DAILY_UPLOAD_LIMIT_PER_ACCOUNT`                                | Expected; wait for the rolling 24h window or raise the limit carefully                                                                                                                             |


### Downloads, Drive, and metadata


| Symptom                        | Likely cause                                                | What to do                                                                                                                                                                                                                                                             |
| ------------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| yt-dlp: no video formats found | Source URL restricted, region, or Instagram layout change   | Confirm the URL opens in a normal browser; update yt-dlp; try another approved link                                                                                                                                                                                    |
| FFmpeg / binary not found      | Not on PATH for the detached worker                         | Install FFmpeg/yt-dlp system-wide, or set `FFMPEG_PATH` / `YT_DLP_PATH` / `FFPROBE_PATH` in `.env`                                                                                                                                                                     |
| Drive upload fails             | Expired refresh token (`invalid_grant`) or wrong folder IDs | Prefer service account (`GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE`); if using OAuth, **publish** the consent screen to Production (Testing tokens die ~7 days). Re-run `scripts/google-drive-auth.mjs` / `scripts/google-drive-test.mjs`; check `pnpm stack:status` → `drive` |
| Titles/captions empty or junk | Rate limit or bad JSON from Gemini/Groq | Check the key and model id; worker should fall back to cleaned source text |


### Web / auth


| Symptom                                        | Likely cause                                   | What to do                                                                                  |
| ---------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Cannot log into local admin                    | Hash or username mismatch                      | Regenerate `ADMIN_PASSWORD_HASH`; confirm `ADMIN_SESSION_SECRET` is set                     |
| Demo login works on production but not locally | Demo env vars missing in `apps/web/.env.local` | Set `DEMO_USERNAME` + `DEMO_PASSWORD_HASH` the same way as production                       |
| Hosted admin Retry does nothing                | Local stack / WF-07 down                       | Vercel only enqueues `admin_commands`; WF-07 on your laptop must be running to execute them |
| Submit rejected                                | Unsupported URL or rate limit                  | Only youtube.com / youtu.be / instagram.com (and approved variants); wait and retry         |


### Verification and cleanup


| Symptom                            | Likely cause                              | What to do                                                                                                                 |
| ---------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Upload succeeds but never verifies | WF-08 inactive and WF-02 wait interrupted | Activate WF-08; or wait for WF-02 → WF-03; `VERIFY_DELAY_MINUTES` defaults to 5 for faster local feedback                  |
| Drive cleanup count looks wrong    | Overview used to count cancelled junk     | Current admin queries focus on `failed` / `needs_manual_review`; re-deploy / pull latest web if you still see stale counts |


When in doubt: **silence for 30+ minutes usually means a stuck lock or inactive poller, not “everything is fine.”** Check `pnpm stack:status`, n8n Active workflows, and the newest job’s status/events in Supabase.

More detail: [docs/setup.md](./docs/setup.md).

---

## Repo layout

```text
apps/web/            Next.js submit form + admin dashboard
apps/worker/         Pipeline worker (download → process → Drive → metadata → upload)
packages/shared/     Shared types, validation, status enums
supabase/            SQL migrations + seed
infra/n8n/           Workflow JSON exports (credential-free) + n8n docs
infra/n8n/workflows/ Ready-to-import WF-01…WF-08 JSON + import notes
infra/google-drive/  Drive OAuth setup
scripts/             stack:up, env helpers, n8n import/export
docs/                setup extras + titles/captions
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
pnpm test:e2e
```

---

## More notes

- [docs/setup.md](./docs/setup.md) — laptop extras I keep forgetting
- [docs/captions.md](./docs/captions.md) — Gemini / Groq keys
- [Drive SETUP](./infra/google-drive/SETUP.md)
- [n8n](./infra/n8n/README.md) and [workflow JSON](./infra/n8n/workflows/README.md)


---

## Security reminders

- Never commit `.env`, `.env.local`, Playwright profiles, Drive tokens, or session cookies.  
- Keep `SUPABASE_SERVICE_ROLE_KEY` and `WORKER_INTERNAL_TOKEN` off the client.  
- `.env.example` uses `REPLACE_ME` placeholders only.  
- Real platform uploads stay off unless you explicitly enable them on a machine you control.  
- CAPTCHA and 2FA are never automated — mark `login_required` and recover the session by hand.

---

## Author

Athan (Techxtreme)