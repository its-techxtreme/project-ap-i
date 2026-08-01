/**
 * Verify Google Drive credentials (service account preferred, else OAuth refresh).
 *
 * Usage: node --env-file=.env scripts/google-drive-test.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

const saFileRaw = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE?.trim()
const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID
const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET
const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN
const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID
const processedFolderId = process.env.GOOGLE_DRIVE_PROCESSED_FOLDER_ID
const failedFolderId = process.env.GOOGLE_DRIVE_FAILED_FOLDER_ID

for (const [k, v] of Object.entries({
  rootFolderId,
  processedFolderId,
  failedFolderId,
})) {
  if (!v || v === 'REPLACE_ME') {
    console.error(`Missing ${k} — complete infra/google-drive/SETUP.md first.`)
    process.exit(1)
  }
}

async function getAccessToken() {
  if (saFileRaw) {
    const saPath = path.isAbsolute(saFileRaw) ? saFileRaw : path.resolve(repoRoot, saFileRaw)
    if (!fs.existsSync(saPath)) {
      console.error(`Service account file not found: ${saPath}`)
      process.exit(1)
    }
    const { createRequire } = await import('node:module')
    const require = createRequire(path.join(repoRoot, 'apps/worker/package.json'))
    const { google } = require('googleapis')
    const auth = new google.auth.GoogleAuth({
      keyFile: saPath,
      scopes: ['https://www.googleapis.com/auth/drive'],
    })
    const token = await auth.getAccessToken()
    if (!token) {
      console.error('Service account failed to mint access token')
      process.exit(1)
    }
    console.log('Service account auth OK')
    return token
  }

  for (const [k, v] of Object.entries({ clientId, clientSecret, refreshToken })) {
    if (!v || v === 'REPLACE_ME') {
      console.error(`Missing ${k} — set OAuth vars or GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE`)
      process.exit(1)
    }
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const tokens = await tokenRes.json()
  if (!tokens.access_token) {
    console.error('Token refresh failed:', tokens)
    console.error(
      '\nIf error is invalid_grant: OAuth Testing-mode tokens expire ~7 days.',
      '\nFix: publish the OAuth app to Production, OR switch to a service account',
      '\n(see infra/google-drive/SETUP.md). Then re-run scripts/google-drive-auth.mjs',
    )
    process.exit(1)
  }
  console.log('OAuth refresh OK')
  return tokens.access_token
}

const accessToken = await getAccessToken()

async function testUpload(label, parentId) {
  const boundary = 'project-api-boundary'
  const metadata = JSON.stringify({
    name: `ap-i-drive-test-${Date.now()}.txt`,
    mimeType: 'text/plain',
    parents: [parentId],
  })
  const body =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    'Content-Type: text/plain\r\n\r\n' +
    'Project AP-I Drive connectivity test\r\n' +
    `--${boundary}--`

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  )
  const uploaded = await uploadRes.json()
  if (!uploadRes.ok) {
    console.error(`${label} upload failed:`, uploaded)
    if (saFileRaw) {
      console.error('Tip: share this folder with the service account email as Editor.')
    }
    process.exit(1)
  }

  await fetch(
    `https://www.googleapis.com/drive/v3/files/${uploaded.id}?supportsAllDrives=true`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  )

  console.log(`${label} upload OK (test file deleted)`)
}

await testUpload('ROOT (staging)', rootFolderId)
await testUpload('PROCESSED', processedFolderId)
await testUpload('FAILED', failedFolderId)

console.log('\nDrive credentials OK — all three folders accept uploads.')
