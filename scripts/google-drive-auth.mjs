/**
 * One-time OAuth helper to obtain GOOGLE_DRIVE_REFRESH_TOKEN.
 * Requires GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET in .env.
 *
 * Usage:
 *   node --env-file=.env scripts/google-drive-auth.mjs
 *   node --env-file=.env scripts/google-drive-auth.mjs --code=PASTE_CODE
 *   node --env-file=.env scripts/google-drive-auth.mjs --url="http://127.0.0.1:53682/oauth2callback?code=...&state=..."
 *
 * Port 53682 is often blocked on Windows (Hyper-V excluded range). When the
 * callback listener cannot bind, open the auth URL, approve access, then paste
 * the full redirect URL (or just the code= value) from the browser address bar.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.resolve(__dirname, '../.env')
const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID
const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET
const scope = 'https://www.googleapis.com/auth/drive.file'
const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI || 'http://127.0.0.1:53682/oauth2callback'
const listenPort = Number(new URL(redirectUri).port || 53682)

if (!clientId || !clientSecret || clientId === 'REPLACE_ME') {
  console.error('Set GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET in .env first.')
  console.error('See infra/google-drive/SETUP.md')
  process.exit(1)
}

const state = crypto.randomBytes(16).toString('hex')
const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
authUrl.searchParams.set('client_id', clientId)
authUrl.searchParams.set('redirect_uri', redirectUri)
authUrl.searchParams.set('response_type', 'code')
authUrl.searchParams.set('scope', scope)
authUrl.searchParams.set('access_type', 'offline')
authUrl.searchParams.set('prompt', 'consent')
authUrl.searchParams.set('state', state)

console.warn(
  '\nNOTE: If your OAuth consent screen is still in Testing mode, refresh tokens expire after ~7 days.',
)
console.warn(
  'For permanence: Publish the app to Production, OR use GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE (see infra/google-drive/SETUP.md).\n',
)

function extractCode(input) {
  const raw = input.trim()
  if (!raw) return null
  if (/^[A-Za-z0-9/_.,+-]+$/.test(raw) && !raw.includes('://') && !raw.includes('=')) {
    return raw
  }
  try {
    const url = new URL(raw.startsWith('http') ? raw : `http://127.0.0.1${raw.startsWith('/') ? '' : '/'}${raw}`)
    return url.searchParams.get('code')
  } catch {
    const match = /[?&#]code=([^&#]+)/.exec(raw)
    return match ? decodeURIComponent(match[1]) : null
  }
}

async function exchangeCode(code) {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  const tokens = await tokenRes.json()
  if (!tokens.refresh_token) {
    console.error('No refresh_token — revoke app access at https://myaccount.google.com/permissions and retry.')
    console.error(tokens)
    process.exit(1)
  }

  let envText = fs.readFileSync(envPath, 'utf8')
  const line = `GOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}`
  if (/^GOOGLE_DRIVE_REFRESH_TOKEN=/m.test(envText)) {
    envText = envText.replace(/^GOOGLE_DRIVE_REFRESH_TOKEN=.*$/m, line)
  } else {
    envText += `\n${line}\n`
  }
  fs.writeFileSync(envPath, envText)
  console.log('GOOGLE_DRIVE_REFRESH_TOKEN saved to .env')
}

function askPaste() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    console.log('\nPaste the full redirect URL (or just the code= value), then press Enter:\n')
    rl.question('> ', (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

async function finishWithCode(code, expectedState) {
  if (!code) {
    console.error('Missing authorization code.')
    process.exit(1)
  }
  if (expectedState) {
    // state is only enforced for live callback; paste path may omit it
  }
  await exchangeCode(code)
  process.exit(0)
}

const argCode = process.argv.find((a) => a.startsWith('--code='))?.slice('--code='.length)
const argUrl = process.argv.find((a) => a.startsWith('--url='))?.slice('--url='.length)
if (argCode || argUrl) {
  const code = extractCode(argCode || argUrl || '')
  await finishWithCode(code)
}

console.log('\n1. Confirm this redirect URI is registered on your Google OAuth client:\n')
console.log(`   ${redirectUri}\n`)
console.log('2. Open this URL in your browser and approve Drive access:\n')
console.log(authUrl.toString())
console.log('\n3. After approve, the browser may fail to load (port blocked).')
console.log('   Copy the FULL address-bar URL (starts with http://127.0.0.1:...) and paste it here.\n')

function startPasteFallback(reason) {
  console.warn(reason)
  console.log('Falling back to paste mode (no local listener).\n')
  askPaste()
    .then(async (answer) => {
      const code = extractCode(answer)
      await finishWithCode(code)
    })
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}

const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith('/oauth2callback')) return
  const url = new URL(req.url, redirectUri)
  if (url.searchParams.get('state') !== state) {
    res.writeHead(400)
    res.end('Invalid state')
    return
  }
  const code = url.searchParams.get('code')
  if (!code) {
    res.writeHead(400)
    res.end('Missing code')
    return
  }

  try {
    await exchangeCode(code)
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<h1>Success</h1><p>Refresh token saved to .env. You can close this tab.</p>')
    server.close()
    process.exit(0)
  } catch (err) {
    res.writeHead(500)
    res.end('Token exchange failed — check terminal.')
    console.error(err)
    server.close()
    process.exit(1)
  }
})

server.listen(listenPort, '127.0.0.1', () => {
  console.log(`OAuth callback server listening on ${listenPort}`)
})
server.on('error', (err) => {
  startPasteFallback(`Failed to bind OAuth callback port ${listenPort}: ${err.message}`)
})
