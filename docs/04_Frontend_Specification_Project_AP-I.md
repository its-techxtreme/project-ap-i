---
subtitle: "Frontend Specification"
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

# Frontend Specification

## Document control

| Field | Value |
|---|---|
| Project name | Project AP-I |
| Developer | Atharva (Techno) |
| Document | Frontend Specification |
| Version | 1.1 |
| Frontend target | Next.js on Vercel |

## Frontend goals

The frontend must be simple for submitters and powerful for admins. The submitter page should feel like a fast internal tool: paste link, select niche, confirm rights, submit. The admin dashboard should show operational truth: what is queued, what is processing, what succeeded, what failed, and what needs manual action.

## User experience principles

1. Fast submission in under 15 seconds.
2. No unnecessary fields.
3. Clear status labels.
4. Admin can identify problems without reading raw logs.
5. Destructive actions require confirmation.
6. Mobile-friendly submitter page.
7. Desktop-first admin dashboard.

## Application routes

```text
/
  Public anonymous submit form (light theme by default + theme toggle)
  Fields: link, platform, niche, rights confirmation, submit

/login
  Admin-only auth login (light/day theme by default + theme toggle)

/submit
  Redirects to / (legacy path)

/admin
  Admin overview (light/day theme by default + theme toggle)

/admin/jobs
  All jobs table (includes collector DMs).

/admin/collector
  Unsorted cargo — collector DMs that arrived without a niche word

/admin/failed
  Failed/manual review jobs

/admin/accounts
  Account health and login status

/admin/niches
  Niche and account mapping (read-only in MVP)

/admin/logs
  Audit and job event logs

/admin/settings
  System settings (Chart room) — effective ops keys synced from laptop worker heartbeat
```

Auth model note (product decision): the public form does not require signup or submitter login.
Only `/admin/*` requires an authenticated admin. Abuse controls: IP rate limit, URL allowlist,
server-side Zod validation, service-role insert (no anon RLS insert on jobs).

## Layout structure

### Submitter layout

```text
Header:
  Project AP-I + compass mark
  Theme toggle (day / night)
  Captain's Deck link → /login

Main parchment panel:
  Link input
  Platform selector
  Niche (sea lane) dropdown
  Rights confirmation checkbox
  Load aboard button

Result state (ShipSuccess):
  “Ahem! The content has been loaded on the ship”
  “The ship is waiting on the dock, ready to sail!!”
  Voyage ticket / sea lane / source port
  Animated ship sailing across the dock
```

### Admin layout

```text
Sidebar (Captain's Deck):
  Crow's nest
  Ship's log
  Lost cargo
  Unsorted cargo
  Crew
  Sea lanes
  Logbook
  Chart room

Topbar:
  Environment badge
  Remote laptop signal (center on large screens; own row on narrow so it never overlaps brand/demo/actions)
  Cargo bay link (public form at `/`)
  Theme toggle (day / night)
  Current user
  Log out

Main content:
  Dense tables, compact filters, icon actions
  Day/night pirate sky wash behind chrome
  Narrow viewports: sticky topbar + Deck menu panel listing every admin destination (Nest → Chart room, including Unsorted cargo); desktop keeps the left rail
```

Login (`/login`): Captain's gate glass panel over pirate sky; **day voyage (light) theme by default**.

## Visual design

### Style direction

- Theme: **Pirate voyage** — One Piece–inspired crew language without copyrighted marks or characters.
- Light = **daytime voyage** (turquoise sea, parchment panels, sun).
- Dark = **night watch** (deep navy, moon + stars, lantern gold).
- Fonts: Pirata One (display) + Source Sans 3 (body).
- Generated sky art under `/public/pirate/` plus SVG ornaments (compass, anchor, map-scroll).
- Motions: sky wash, wave shimmer, ship-sail success, moon rise (respects `prefers-reduced-motion`).

### Status colors

```text
queued: gray
processing: blue
ready_to_upload: purple
uploading: indigo
awaiting_verification: amber
completed: green
failed: red
needs_manual_review: orange
login_required: red
```

### Typography

- Display / brand: Pirata One
- Body / UI: Source Sans 3
- Never use Inter, Roboto, Arial, or system-ui as primary

Recommended:

```text
Headings: Pirata One on page titles / brand
Body: regular (Source Sans 3)
Tables: small but readable
Badges: medium weight
```

## Submit page detailed specification

### Fields

#### Link input

Label: `Approved Reel/Short Link`

Placeholder:

```text
Paste Instagram Reel or YouTube Shorts link
```

Client-side validation:

- Required.
- Must parse as URL.
- Domain must be allowed.
- Auto-detect platform.

Allowed hostnames:

```text
instagram.com
www.instagram.com
youtube.com
www.youtube.com
youtu.be
m.youtube.com
```

#### Platform selector

Label: `Platform`

Options:

```text
YouTube
Instagram
```

Behavior:

- Auto-filled after URL paste.
- User can edit if needed.
- Only two options.

#### Niche dropdown

Label: `Niche`

Options loaded from active `niches` table.

Each niche row must have:

- `id`
- `name`
- active YouTube account mapping
- active Instagram account mapping

If no valid niche is available, show:

```text
No active niche is configured. Contact admin.
```

#### Rights confirmation

Label:

```text
I confirm this content is client-approved and we have permission to process and publish it.
```

Required.

This value is stored in the job row.

#### Submit button

States:

```text
Load aboard
Validating...
Loading aboard…
(success → ShipSuccess panel)
```

### Submit page error messages

```text
Please paste a valid URL.
Only YouTube and Instagram links are supported.
Please select a sea lane (niche).
Confirm rights before the cargo can board.
This niche is not fully configured yet.
Submission failed. Please try again.
```

### Success message

```text
Ahem! The content has been loaded on the ship
The ship is waiting on the dock, ready to sail!!
```

Optional display:

```text
Voyage ticket: AP-I-20260628-0001
Sea lane: Memes
Source port: YouTube
Status: Queued at the dock — awaiting crew
```

## Admin overview page

### Cards

```text
At dock
Under weigh
Landed today
Lost today
Needs boarding
Crew locked out
Hold cleanup
```

### Recent activity

A compact timeline:

```text
10:15 - Job created
10:18 - Download started
10:20 - Processing completed
10:24 - YouTube upload succeeded
10:27 - Instagram upload failed
```

## Jobs table

Columns:

```text
Job ID
Created
Source Platform
Niche
Status
YouTube Status
Instagram Status
YouTube URL
Instagram URL
Drive File
Retry Count
Failure Reason
Actions
```

Filters:

```text
Status
Niche
Source platform
YouTube upload status
Instagram upload status
```

Jobs table shows a FIFO **Queue** number (`#1`, `#2`, …) for `queued` / `ready_to_upload` jobs.
Admin actions include pause/unpause (`paused` skips claim; unpause requeues at end of FIFO), cancel (sets `cancelled` + optional `abort_job`), retry, ignore, Drive delete, and manual YouTube URL attach after capture-miss.

When a job is parked for soft `DAILY_UPLOAD_LIMIT_REACHED`, the Retries column shows a **Force** button (admin only) instead of the retry count. Force arms a one-shot `force_upload_override` so claim/upload bypass the soft cap for that job only (platform hard limits still apply).

Note: Jobs filters do not include created-date range (Created from / Created to). Date filters remain on Logs only.

Actions:

```text
View details
Retry upload
Open source
Open Drive file
Cancel job
Delete job entry (permanent; does not remove platform posts)
```

Drive file deletion remains on Failed Review (bulk + per-row).

## Unsorted cargo (`/admin/collector`)

Crew DMs that arrived without a niche word. Admin (write) opens the Instagram link, picks Memes / Anime / Sports, and confirms. Reject marks the row invalid (`admin_rejected`) so the collector does not put it back. Demo is read-only. Confirm creates a normal queued job with rights assumed. No in-dashboard reel preview.

## Job details page/drawer

The job detail view should show:

```text
Basic info:
  Job ID
  Source URL
  Source platform
  Niche
  Created by
  Rights confirmed
  Created at

Processing:
  Download status
  Processing status
  Drive file ID/link
  Temp cleanup status

Metadata:
  YouTube title
  YouTube description
  Instagram caption

Uploads:
  YouTube account
  YouTube status
  YouTube uploaded URL/ID if available
  Instagram account
  Instagram status
  Instagram uploaded URL/ID if available

Failures:
  Last error code
  Failure reason
  Retry count

Timeline:
  Every major event from job_events/audit_logs
  Upload completed events include clickable YouTube/Instagram URLs
  Verification completed event includes both published URLs
```

## Failed review page

This is the most important admin page after launch.

Columns:

```text
Select checkbox
Job ID
Niche
Failed stage
YouTube status
Instagram status
Failure reason
Drive file
Retry count
Actions
```

Bulk actions (wired to the same server actions as per-row controls):

```text
Retry selected upload
Delete selected Drive files
Mark selected ignored
```

Each selected job is processed individually; the toolbar reports succeeded/failed counts. Retry and Drive delete enqueue `admin_commands` for the local worker/n8n stack. Mark ignored is DB-only.

Deletion confirmation copy:

```text
This will delete the selected staged video file(s) from Google Drive. The job record and logs will remain in Supabase. Continue?
```

## Accounts page

Columns:

```text
Niche
Platform
Account label
Status
Login required
Last successful upload
Failure count
Browser profile path
Actions
```

Actions:

```text
Mark login recovered (sets status=active, login_required=false)
Pause account (status=paused)
Resume account (status=active; blocked while login_required or disabled)
Test session (optional / future)
View recent failures (optional / future)
```

Account statuses:

```text
active
paused
login_required
failing
disabled
```

## Niches page

Fields:

```text
Niche name
Slug
Active true/false (green active signal / amber when paused)
Mapped YouTube account — live profile card (handle, display name, avatar, description, profile link)
Mapped Instagram account — live profile card (same fields)
```

Rules:

- Submit page only shows active niches.
- A niche is valid only if it has one active YouTube account and one active Instagram account.
- Admin should see warnings for incomplete mappings.
- Profile cards are fetched server-side from public Open Graph metadata using `platform_accounts.username_hint` (fallback: niche brand handles ShonenSnaps / CrackleCrumb / ScoreMorsel). Cached ~1 hour so the chart stays current without hammering platforms.
- Read-only in MVP; editing lands later.

## Logs page

Log filters:

```text
Job ID
User
Action
Stage
Date
Severity
```

Common events:

```text
job_created
job_locked
download_started
download_completed
processing_started
processing_completed
drive_upload_completed
youtube_upload_started
youtube_upload_completed
instagram_upload_started
instagram_upload_completed
verification_started
verification_completed
drive_deleted
manual_retry_requested
manual_drive_delete_requested
account_login_required
```

## Frontend data access model

### Submitter

Submitter should call server action or API route:

```text
POST /api/jobs
```

The server action validates auth and input before inserting.

### Admin

Admin pages should use server-side role checks before returning data.

Recommended pattern:

```text
getCurrentUser()
getUserRole()
if role !== admin -> redirect or 403
fetch admin data
```

Do not rely only on hiding admin links in the UI.

## Validation schema

Use Zod shared schema.

```ts
const SubmitJobSchema = z.object({
  sourceUrl: z.string().url(),
  sourcePlatform: z.enum(['youtube', 'instagram']),
  nicheId: z.string().uuid(),
  rightsConfirmed: z.literal(true),
})
```

Server-side validation must re-check domain allowlist.

## URL detection logic

Pseudo-logic:

```ts
function detectPlatform(url: string): 'youtube' | 'instagram' | null {
  const host = new URL(url).hostname.replace('www.', '')
  if (host === 'instagram.com') return 'instagram'
  if (host === 'youtube.com' || host === 'youtu.be' || host === 'm.youtube.com') return 'youtube'
  return null
}
```

## Loading states

Submission page:

- Show spinner on submit.
- Disable form during submission.
- Keep entered URL if error occurs.

Admin pages:

- Use table skeletons.
- Auto-refresh every 30 to 60 seconds on overview and jobs pages.
- Do not auto-refresh while a destructive confirmation dialog is open.

## Empty states

```text
No jobs yet.
No failed jobs.
No accounts require login.
No audit logs found for this filter.
```

## Accessibility

- All form fields must have labels.
- Buttons must have visible text.
- Status badges must not rely only on color.
- Tables should have headers.
- Confirmation dialogs should be keyboard accessible.

## Frontend security requirements

- No service role key in browser bundle.
- No platform credentials in frontend.
- Admin route checks server-side.
- API actions validate user session.
- Destructive actions require admin role.
- Do not expose raw internal worker URLs to the browser.

## Frontend acceptance checklist

- Submitter can submit valid YouTube link.
- Submitter can submit valid Instagram link.
- Invalid domain is rejected.
- Missing rights checkbox blocks submission.
- Missing niche blocks submission.
- Non-admin cannot access `/admin` pages.
- Admin can see jobs.
- Admin can retry failed job.
- Admin can delete selected failed Drive files.
- Admin can see account login-required status.
- All key actions write audit logs.

## Finalized submission form fields - Version 1.1

The submitter form must contain exactly these primary fields in MVP:

| Field | Type | Required | Behavior |
|---|---|---:|---|
| Reel/Short link | URL input | Yes | Accept only YouTube/Instagram domains after validation. |
| Platform | Select | Yes | Auto-detect from URL, but allow manual correction between `YouTube` and `Instagram`. |
| Niche | Select | Yes | Exactly three options: `Memes`, `Anime`, `Sports`. |
| Rights confirmation | Checkbox | Yes | Must be checked before submission. |
| Submit | Button | Yes | Disabled until all validations pass. |

Fields intentionally removed from MVP:

```text
client/source owner
priority
notes
target account group manual selector
AI niche classification
file upload
posting schedule
```

### Niche dropdown values

```ts
export const NICHE_OPTIONS = [
  { slug: 'memes', label: 'Memes' },
  { slug: 'anime', label: 'Anime' },
  { slug: 'sports', label: 'Sports' },
] as const;
```

### Submission success state

After a successful submission, show:

```text
Submitted successfully.
Niche: <selected niche>
Platform detected: <YouTube/Instagram>
Status: Queued for processing
```

Do not expose internal worker paths, account credentials, Drive folder IDs, or service errors to submitters.

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
