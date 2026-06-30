/**
 * One-time OAuth helper to obtain GOOGLE_DRIVE_REFRESH_TOKEN.
 * Requires GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET in .env.
 *
 * Usage: node --env-file=.env scripts/google-drive-auth.mjs
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.resolve(__dirname, '../.env')
const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID
const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET
const scope = 'https://www.googleapis.com/auth/drive.file'
const redirectUri = 'http://127.0.0.1:53682/oauth2callback'

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

console.log('\n1. Add this redirect URI to your Google OAuth client (Desktop or Web):\n')
console.log(`   ${redirectUri}\n`)
console.log('2. Open this URL in your browser:\n')
console.log(authUrl.toString())
console.log('\nWaiting for callback on port 53682...\n')

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
    res.writeHead(500)
    res.end('No refresh_token — revoke app access and retry with prompt=consent.')
    console.error(tokens)
    server.close()
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

  res.writeHead(200, { 'content-type': 'text/html' })
  res.end('<h1>Success</h1><p>Refresh token saved to .env. You can close this tab.</p>')
  console.log('GOOGLE_DRIVE_REFRESH_TOKEN saved to .env')
  server.close()
  process.exit(0)
})

server.listen(53682, '127.0.0.1')
