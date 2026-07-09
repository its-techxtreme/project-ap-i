/**
 * Hash an admin password for ADMIN_PASSWORD_HASH.
 *
 * Usage (from repo root):
 *   node --env-file=.env scripts/hash-admin-password.mjs
 *   node scripts/hash-admin-password.mjs "your-password"
 *
 * Prints a scrypt hash. Put it in ADMIN_PASSWORD_HASH (never commit the plaintext).
 */
import { randomBytes, scryptSync } from 'node:crypto'
import { createInterface } from 'node:readline'

const KEY_LEN = 64
const N = 16384
const R = 8
const P = 1

function hashPassword(password) {
  const salt = randomBytes(16)
  const derived = scryptSync(password, salt, KEY_LEN, { N, r: R, p: P })
  return ['scrypt', String(N), String(R), String(P), salt.toString('base64url'), derived.toString('base64url')].join(
    '$',
  )
}

async function readPassword() {
  const arg = process.argv[2]
  if (arg) return arg

  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const password = await new Promise((resolve) => {
    rl.question('Admin password to hash: ', (answer) => {
      rl.close()
      resolve(answer)
    })
  })
  return password
}

const password = await readPassword()
if (!password || !String(password).trim()) {
  console.error('No password provided.')
  process.exit(1)
}

const hash = hashPassword(String(password))
console.log('\nAdd these to .env / Vercel (server-only, never NEXT_PUBLIC_):\n')
console.log(`ADMIN_USERNAME=${process.env.ADMIN_USERNAME ?? 'your-admin-username'}`)
console.log(`ADMIN_PASSWORD_HASH=${hash}`)
console.log(
  `ADMIN_SESSION_SECRET=${process.env.ADMIN_SESSION_SECRET ?? randomBytes(32).toString('hex')}`,
)
console.log('\nRemove ADMIN_PASSWORD (plaintext) after setting ADMIN_PASSWORD_HASH.\n')
