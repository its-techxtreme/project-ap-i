/**
 * Verify Google Drive OAuth credentials by uploading a tiny test file
 * into the staging folder, then deleting it.
 *
 * Note: drive.file scope cannot read folder metadata (GET returns 404),
 * but uploads to user-created folders work fine.
 *
 * Usage: node --env-file=.env scripts/google-drive-test.mjs
 */
const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID
const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET
const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN
const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID
const processedFolderId = process.env.GOOGLE_DRIVE_PROCESSED_FOLDER_ID
const failedFolderId = process.env.GOOGLE_DRIVE_FAILED_FOLDER_ID

for (const [k, v] of Object.entries({
  clientId,
  clientSecret,
  refreshToken,
  rootFolderId,
  processedFolderId,
  failedFolderId,
})) {
  if (!v || v === 'REPLACE_ME') {
    console.error(`Missing ${k} — complete infra/google-drive/SETUP.md first.`)
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
  process.exit(1)
}

console.log('OAuth refresh OK')

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
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  )
  const uploaded = await uploadRes.json()
  if (!uploadRes.ok) {
    console.error(`${label} upload failed:`, uploaded)
    process.exit(1)
  }

  await fetch(`https://www.googleapis.com/drive/v3/files/${uploaded.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })

  console.log(`${label} upload OK (test file deleted)`)
}

await testUpload('ROOT (staging)', rootFolderId)
await testUpload('PROCESSED', processedFolderId)
await testUpload('FAILED', failedFolderId)

console.log('\nDrive credentials OK — all three folders accept uploads.')
