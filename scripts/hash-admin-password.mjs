/** Print a scrypt hash for ADMIN_PASSWORD_HASH or DEMO_PASSWORD_HASH. Dont commit plaintext. */
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
  if (process.env.DEMO_PASSWORD) return process.env.DEMO_PASSWORD

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const password = await new Promise((resolve) => {
    rl.question('Password to hash: ', (answer) => {
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
console.log(`DEMO_USERNAME=${process.env.DEMO_USERNAME ?? 'your-demo-username'}`)
console.log(`DEMO_PASSWORD_HASH=${hash}`)
console.log(
  `ADMIN_SESSION_SECRET=${process.env.ADMIN_SESSION_SECRET ?? randomBytes(32).toString('hex')}`,
)
console.log('\nRemove ADMIN_PASSWORD / DEMO_PASSWORD (plaintext) after setting *_PASSWORD_HASH.\n')
console.log('Note: run twice with different passwords if admin and demo passwords differ.\n')
