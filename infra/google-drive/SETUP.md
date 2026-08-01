# Google Drive credentials

The worker stages edited videos on Google Drive. Supabase remains the source of truth; Drive is staging only.

## Important (April 2025+)

New Google **service accounts have no Drive storage quota** and **cannot own files in My Drive**, even if a personal folder is shared with them. You will see:

`Service Accounts do not have storage quota`

Permanent options:

1. **Service account + Shared Drive** (best if you have Google Workspace)
2. **User OAuth** with a published app + dedicated Google account (works on personal Gmail)

---

## Option A — Service account + Shared Drive (recommended when Workspace is available)

### A1. Create service account + JSON key

1. [Google Cloud Console](https://console.cloud.google.com/) → your project (`project-ap-1`).
2. Enable **Google Drive API**.
3. **IAM & Admin → Service Accounts → Create** (e.g. `project-api-drive`).
4. **Keys → Add key → JSON** → save outside the repo, e.g. `C:\Users\notte\secrets\project-ap-1-….json`.
5. Copy the SA email: `project-api-drive@project-ap-1.iam.gserviceaccount.com`.

### A2. Create a Shared Drive (Workspace required)

Personal `@gmail.com` My Drive cannot host this. You need Google Workspace.

1. In Drive left nav → **Shared drives** → **New**
2. Name: `AP-I Staging` (or similar)
3. Manage members → add the SA email as **Content manager** (or Manager)
4. Also add your human admin account as Manager

### A3. Create the three folders inside the Shared Drive

Inside the Shared Drive create:

| Folder | Env var |
|--------|---------|
| `AP-I Staging` (root/incoming) | `GOOGLE_DRIVE_ROOT_FOLDER_ID` |
| `AP-I Processed` | `GOOGLE_DRIVE_PROCESSED_FOLDER_ID` |
| `AP-I Failed` | `GOOGLE_DRIVE_FAILED_FOLDER_ID` |

Open each folder and copy the ID from the URL (`…/folders/FOLDER_ID`).

### A4. `.env`

```bash
GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE=C:\Users\notte\secrets\project-ap-1-….json
GOOGLE_DRIVE_ROOT_FOLDER_ID=...
GOOGLE_DRIVE_PROCESSED_FOLDER_ID=...
GOOGLE_DRIVE_FAILED_FOLDER_ID=...
```

When `GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE` is set, OAuth refresh-token vars are ignored.

### A5. Verify + restart

```bash
node --env-file=.env scripts/google-drive-test.mjs
pnpm stack:up
pnpm stack:status
```

Expect `Service account auth OK` and all three folder uploads OK, then `drive=true (...service_account_ok...)`.

---

## Option B — User OAuth (personal Gmail / no Shared Drive)

Use a **dedicated Google account** that only the worker uses (don’t log into it casually). Keep the OAuth app **In production**.

### B1. Remove / comment SA override

In `.env`, comment out so OAuth is used again:

```bash
# GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE=...
```

Keep your existing folder IDs (My Drive folders are fine for OAuth).

### B2. Re-issue refresh token

```bash
node --env-file=.env scripts/google-drive-auth.mjs
```

Approve with the Drive owner account, paste the redirect URL if needed. This writes a new `GOOGLE_DRIVE_REFRESH_TOKEN`.

### B3. Verify + restart

```bash
node --env-file=.env scripts/google-drive-test.mjs
pnpm stack:up
pnpm stack:status
```

Worker health includes a Drive probe and will **stop claiming jobs** if the token dies again (`DRIVE_AUTH_FAILED`), instead of failing the whole queue silently.

If `invalid_grant` returns later: re-run `google-drive-auth.mjs` (usually after password reset / security revoke / Google account changes).

---

## Security

- Never commit `.env`, refresh tokens, or service-account JSON.
- Prefer a dedicated Google / Workspace account for production staging.
- Rotate SA keys / client secrets if exposed.
