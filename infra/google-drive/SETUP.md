# Google Drive credentials (OAuth2)

The worker uses a **refresh token** (long-lived) plus client ID/secret to upload staged videos. Supabase remains the source of truth; Drive is staging only.

## Step 1 — Google Cloud project

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project (e.g. `project-ap-i-dev`).
3. **APIs & Services → Library** → enable **Google Drive API**.

## Step 2 — OAuth consent screen

1. **APIs & Services → OAuth consent screen**.
2. User type: **External** (or Internal if you have Workspace).
3. Add app name, support email, developer email.
4. Scopes → add **`https://www.googleapis.com/auth/drive.file`**  
   (creates/edits files the app opens — least privilege for staging uploads).
   Note: with this scope, reading folder metadata by ID may return 404, but **uploads into your folders still work**.
5. Add your Google account as a **Test user** while in Testing mode.

## Step 3 — OAuth client

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type: **Desktop app** (simplest for refresh-token flow).
3. Copy **Client ID** and **Client secret** into `.env`:
   - `GOOGLE_DRIVE_CLIENT_ID`
   - `GOOGLE_DRIVE_CLIENT_SECRET`

## Step 4 — Refresh token (one-time)

### Option A — OAuth 2.0 Playground (easiest)

1. Open [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/).
2. Gear icon → check **Use your own OAuth credentials** → paste Client ID & Secret.
3. Step 1: select scope `https://www.googleapis.com/auth/drive.file` → **Authorize APIs**.
4. Sign in with the Google account that owns the staging Drive folders.
5. Step 2: **Exchange authorization code for tokens**.
6. Copy **Refresh token** → `.env` as `GOOGLE_DRIVE_REFRESH_TOKEN`.

### Option B — CLI script (repo)

After Client ID/Secret are in `.env`:

```bash
node scripts/google-drive-auth.mjs
```

Follow the printed URL, paste the auth code, script writes the refresh token into `.env`.

## Step 5 — Drive folders

Create three folders in the Google account you authorized (names are up to you):

| Purpose | Suggested name | `.env` variable |
|---------|----------------|-----------------|
| Incoming / root staging | `AP-I Staging` | `GOOGLE_DRIVE_ROOT_FOLDER_ID` |
| Processed ready to upload | `AP-I Processed` | `GOOGLE_DRIVE_PROCESSED_FOLDER_ID` |
| Failed / manual review | `AP-I Failed` | `GOOGLE_DRIVE_FAILED_FOLDER_ID` |

Folder ID = last segment of the URL when the folder is open:

`https://drive.google.com/drive/folders/`**`1abc...xyz`**

## Step 6 — Verify

```bash
node scripts/google-drive-test.mjs
```

Lists the three folders (no upload) if credentials are valid.

## Security notes

- Never commit `.env` or refresh tokens.
- Use a dedicated Google account or Shared Drive for production staging.
- Rotate client secret if exposed; refresh token can be revoked in [Google Account → Security → Third-party access](https://myaccount.google.com/permissions).
