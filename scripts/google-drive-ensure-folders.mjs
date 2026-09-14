/** Make AP-I Drive staging folders. Writes folder ids back into .env. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.resolve(__dirname, '../.env')

const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID
const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET
const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN

if (!clientId || !clientSecret || !refreshToken) {
  console.error('Missing Drive OAuth env vars')
  process.exit(1)
}

function upsertEnv(key, value) {
  let text = fs.readFileSync(envPath, 'utf8')
  const line = `${key}=${value}`
  if (new RegExp(`^${key}=`, 'm').test(text)) {
    text = text.replace(new RegExp(`^${key}=.*$`, 'm'), line)
  } else {
    text += `\n${line}\n`
  }
  fs.writeFileSync(envPath, text)
}

async function getAccessToken() {
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
  return tokens.access_token
}

async function api(accessToken, method, url, body) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

async function probeUpload(accessToken, parentId) {
  const boundary = 'project-api-boundary'
  const metadata = JSON.stringify({
    name: `ap-i-probe-${Date.now()}.txt`,
    mimeType: 'text/plain',
    parents: [parentId],
  })
  const body =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    'Content-Type: text/plain\r\n\r\n' +
    'probe\r\n' +
    `--${boundary}--`

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
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
  if (!uploadRes.ok) return { ok: false, error: uploaded }
  await fetch(`https://www.googleapis.com/drive/v3/files/${uploaded.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  return { ok: true }
}

async function findFolderByName(accessToken, name) {
  const q = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`,
  )
  const { ok, data } = await api(
    accessToken,
    'GET',
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=5&spaces=drive`,
  )
  if (!ok) return null
  return data.files?.[0] ?? null
}

async function createFolder(accessToken, name) {
  const { ok, data, status } = await api(
    accessToken,
    'POST',
    'https://www.googleapis.com/drive/v3/files?fields=id,name',
    { name, mimeType: 'application/vnd.google-apps.folder' },
  )
  if (!ok) {
    throw new Error(`Create folder failed (${status}): ${JSON.stringify(data)}`)
  }
  return data
}

async function ensureFolder(accessToken, envKey, preferredName) {
  const existingId = process.env[envKey]
  if (existingId && existingId !== 'REPLACE_ME') {
    const probe = await probeUpload(accessToken, existingId)
    if (probe.ok) {
      console.log(`OK existing ${envKey}=${existingId}`)
      return existingId
    }
    console.log(`Existing ${envKey} not usable — will recreate`)
  }

  const found = await findFolderByName(accessToken, preferredName)
  if (found?.id) {
    upsertEnv(envKey, found.id)
    console.log(`Reused folder ${preferredName} → ${envKey}=${found.id}`)
    return found.id
  }

  const created = await createFolder(accessToken, preferredName)
  upsertEnv(envKey, created.id)
  console.log(`Created folder ${preferredName} → ${envKey}=${created.id}`)
  return created.id
}

const accessToken = await getAccessToken()
console.log('OAuth refresh OK')

const aboutRes = await api(
  accessToken,
  'GET',
  'https://www.googleapis.com/drive/v3/about?fields=user',
)
console.log('Authorized as:', aboutRes.data.user?.emailAddress)

await ensureFolder(accessToken, 'GOOGLE_DRIVE_ROOT_FOLDER_ID', 'AP-I Staging')
await ensureFolder(accessToken, 'GOOGLE_DRIVE_PROCESSED_FOLDER_ID', 'AP-I Processed')
await ensureFolder(accessToken, 'GOOGLE_DRIVE_FAILED_FOLDER_ID', 'AP-I Failed')

console.log('Done — .env folder IDs updated if needed')
