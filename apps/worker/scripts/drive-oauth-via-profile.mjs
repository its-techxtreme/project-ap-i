/** Finish Drive OAuth in an existing YT Playwright profile (already a Google session). */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../../..')
const PROFILES_DIR = path.join(REPO_ROOT, 'playwright-profiles')

function parseArgs(argv) {
  let profile = 'anime-yt'
  let url = null
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--profile') profile = argv[++i]
    else if (argv[i] === '--url') url = argv[++i]
  }
  if (!url) throw new Error('Missing --url <google oauth url>')
  return { profile, url }
}

const { profile, url } = parseArgs(process.argv.slice(2))
const profilePath = path.isAbsolute(profile)
  ? profile
  : path.join(PROFILES_DIR, profile.replace(/^playwright-profiles[\\/]/, ''))

console.log(`Using profile: ${profilePath}`)
console.log('Opening OAuth URL in headed Chrome...')

const context = await chromium.launchPersistentContext(profilePath, {
  channel: 'chrome',
  headless: false,
  viewport: null,
  args: ['--no-first-run', '--no-default-browser-check'],
})

const page = context.pages()[0] ?? (await context.newPage())

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  console.log('Loaded:', page.url())

  // If account chooser appears, click the first account button.
  const accountBtn = page.locator('[data-identifier], [data-email], div[role="link"][data-identifier]').first()
  if (await accountBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    console.log('Selecting Google account from chooser...')
    await accountBtn.click()
    await page.waitForTimeout(1500)
  }

  // Consent / Continue / Allow buttons (Google varies copy).
  const allow = page.getByRole('button', {
    name: /allow|continue|accept|confirm|i agree/i,
  })
  if (await allow.first().isVisible({ timeout: 8_000 }).catch(() => false)) {
    console.log('Clicking consent button...')
    await allow.first().click()
  }

  // Wait for local callback success page or redirect.
  await page.waitForURL(/127\.0\.0\.1:53682|localhost:53682|Success/i, {
    timeout: 120_000,
  }).catch(() => null)

  console.log('Final URL:', page.url())
  const body = await page.locator('body').innerText().catch(() => '')
  console.log('Page text:', body.slice(0, 300))

  if (/success|refresh token saved/i.test(body) || /53682/.test(page.url())) {
    console.log('PASS: OAuth callback likely completed')
  } else {
    console.log('WARN: May still need manual click in the opened Chrome window')
    // Keep browser open briefly for manual finish if needed
    await page.waitForTimeout(60_000)
  }
} finally {
  await context.close().catch(() => {})
}
