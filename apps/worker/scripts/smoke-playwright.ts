/**
 * Headed Chrome smoke. Does not upload unless REAL_UPLOADS_ENABLED is on.
 *
 *   pnpm --filter @project-api/worker smoke:playwright -- --check-install
 *   pnpm --filter @project-api/worker smoke:playwright -- --login --profile memes-yt
 */

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { spawn } from 'node:child_process'

import { chromium } from 'playwright'

import { config } from '../src/config'
import { findChromeExecutable, loginStartUrl } from '../src/uploaders/chromeExecutable'
import { detectLoginOrChallenge } from '../src/uploaders/loginChallengeDetection'
import { launchAuthenticatedContext } from '../src/uploaders/playwrightContext'
import { humanPause, humanReadingPause, humanScroll } from '../src/uploaders/playwrightHumanBehavior'
import { SessionHealthChecker } from '../src/uploaders/SessionHealthChecker'

/** Profiles sit in <repo>/playwright-profiles, not under apps/worker. */
const REPO_ROOT = path.resolve(__dirname, '../../..')
const DEFAULT_PROFILES_DIR = path.join(REPO_ROOT, 'playwright-profiles')

interface CliOptions {
  checkInstall: boolean
  launchHeaded: boolean
  login: boolean
  session: boolean
  navigate: 'youtube' | 'instagram' | null
  platform: 'youtube' | 'instagram' | null
  profile: string | null
  accountId: string
  headed: boolean
  screenshot: boolean
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    checkInstall: false,
    launchHeaded: false,
    login: false,
    session: false,
    navigate: null,
    platform: null,
    profile: null,
    accountId: 'smoke-test',
    headed: false,
    screenshot: false,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--check-install') opts.checkInstall = true
    else if (arg === '--launch-headed') opts.launchHeaded = true
    else if (arg === '--login') opts.login = true
    else if (arg === '--session') opts.session = true
    else if (arg === '--navigate') {
      const platform = argv[++i]
      if (platform === 'youtube' || platform === 'instagram') opts.navigate = platform
      else throw new Error('--navigate requires youtube or instagram')
    } else if (arg === '--platform') {
      const platform = argv[++i]
      if (platform === 'youtube' || platform === 'instagram') opts.platform = platform
      else throw new Error('--platform requires youtube or instagram')
    } else if (arg === '--profile') opts.profile = argv[++i] ?? null
    else if (arg === '--account-id') opts.accountId = argv[++i] ?? opts.accountId
    else if (arg === '--headed') opts.headed = true
    else if (arg === '--screenshot') opts.screenshot = true
  }

  return opts
}

function pass(msg: string): void {
  console.log(`PASS: ${msg}`)
}

function fail(msg: string, detail?: unknown): never {
  console.error(`FAIL: ${msg}`, detail ?? '')
  process.exit(1)
}

/**
 * Slug like memes-yt, or a relative/absolute folder.
 * Check repo playwright-profiles first, then cwd.
 */
async function resolveProfilePath(profileArg: string): Promise<string> {
  if (path.isAbsolute(profileArg)) {
    return profileArg
  }

  const normalized = profileArg.replace(/^\.\/+/, '')
  const slug = path.basename(normalized)

  const candidates = [
    path.join(DEFAULT_PROFILES_DIR, slug),
    path.resolve(REPO_ROOT, normalized),
    path.resolve(process.cwd(), profileArg),
    path.resolve(process.cwd(), normalized),
  ]

  const seen = new Set<string>()
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue
    seen.add(candidate)
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      // missing, try the next path
    }
  }

  fail(
    `Profile path not found: ${profileArg}\n` +
      `Expected folder under ${DEFAULT_PROFILES_DIR}\n` +
      `Tried:\n${[...seen].map((p) => `  - ${p}`).join('\n')}`,
  )
}

function inferPlatformFromProfile(profilePath: string): 'youtube' | 'instagram' | null {
  const slug = path.basename(profilePath).toLowerCase()
  if (slug.endsWith('-yt') || slug.includes('youtube')) return 'youtube'
  if (slug.endsWith('-ig') || slug.includes('instagram')) return 'instagram'
  return null
}

function waitForEnter(prompt: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(prompt, () => {
      rl.close()
      resolve()
    })
  })
}

async function checkPlaywrightInstall(): Promise<void> {
  try {
    const browser = await chromium.launch({ headless: true })
    await browser.close()
    pass('Playwright bundled Chromium launches (headless check)')
  } catch (err) {
    fail(
      'Playwright Chromium not installed. Run: pnpm --filter @project-api/worker exec playwright install chromium',
      err,
    )
  }
}

async function runHeadedLaunchSmoke(): Promise<void> {
  const tempProfile = await fs.mkdtemp(path.join(os.tmpdir(), 'ap-i-playwright-smoke-'))
  let context

  try {
    context = await launchAuthenticatedContext(tempProfile, { headless: false })
    const page = await context.newPage()
    await page.goto('https://www.youtube.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await humanReadingPause()
    pass('Headed bundled Chromium opened YouTube successfully')
  } finally {
    await context?.close()
    await fs.rm(tempProfile, { recursive: true, force: true })
  }
}

async function runSessionCheck(profile: string, accountId: string, headed: boolean): Promise<void> {
  const useHeaded = headed || !config.PLAYWRIGHT_HEADLESS

  if (useHeaded) {
    let context
    try {
      context = await launchAuthenticatedContext(profile, { headless: false })
      pass(`Profile folder launches in headed Chromium (${accountId})`)
      console.log('  Note: --session only checks launch. Use --login to save a manual login session.')
    } finally {
      await context?.close()
    }
    return
  }

  const checker = new SessionHealthChecker()
  const result = await checker.checkSession(accountId, profile)

  if (result.healthy) {
    pass(`Session health OK for profile ${profile}`)
  } else {
    fail(`Session unhealthy: ${result.reason ?? 'unknown'}`, result)
  }
}

async function runChromeManualLogin(platform: 'youtube' | 'instagram', profile: string): Promise<void> {
  const chrome = await findChromeExecutable(config.PLAYWRIGHT_CHROME_PATH)
  if (!chrome) {
    fail(
      'Google Chrome is required for login. Install from https://www.google.com/chrome/ ' +
        'or set PLAYWRIGHT_CHROME_PATH in .env to your chrome.exe path.',
    )
  }

  const startUrl = loginStartUrl(platform)

  console.log('\n--- Manual login via real Google Chrome ---')
  console.log(
    'Google blocks sign-in inside Playwright bundled Chromium ("browser may not be secure").',
  )
  console.log('Opening installed Chrome with your profile folder instead.\n')
  console.log(`  Chrome:  ${chrome}`)
  console.log(`  Profile: ${profile}`)
  console.log(`  URL:     ${startUrl}\n`)

  if (platform === 'youtube') {
    console.log('Steps:')
    console.log('  1. Log in with your Google account')
    console.log('  2. Complete 2FA if prompted')
    console.log('  3. Confirm YouTube Studio opens: https://studio.youtube.com/')
  } else {
    console.log('Steps:')
    console.log('  1. Log in with your Instagram account')
    console.log('  2. Complete 2FA/challenge if prompted')
    console.log('  3. Confirm you see your home feed')
  }

  console.log('\nWhen done: close ALL Chrome windows, then press ENTER here.\n')

  spawn(
    chrome,
    [`--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', startUrl],
    { detached: true, stdio: 'ignore' },
  ).unref()

  await waitForEnter('Press ENTER after login is complete and Chrome is fully closed... ')

  pass(`Login session saved to ${profile}`)
}

async function runLoginSetup(platform: 'youtube' | 'instagram', profile: string): Promise<void> {
  // Google blocks Playwright Chromium login. Open real Chrome instead.
  if (platform === 'youtube') {
    await runChromeManualLogin(platform, profile)
    return
  }

  const chrome = await findChromeExecutable(config.PLAYWRIGHT_CHROME_PATH)
  if (chrome) {
    await runChromeManualLogin(platform, profile)
    return
  }

  let context

  try {
    context = await launchAuthenticatedContext(profile, { headless: false })
    const page = await context.newPage()

    console.log('\n--- Instagram login setup (Playwright) ---')
    console.log('1. Log in with your Instagram account in the browser window')
    console.log('2. Complete 2FA/challenge if prompted')
    console.log('3. Confirm you see your home feed\n')

    await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 })

    console.log('Browser is open — complete login in that window.')
    console.log('When finished, return here and press ENTER to save the session and close.\n')

    await waitForEnter('Press ENTER when login is complete... ')

    pass(`Login session saved to ${profile}`)
  } finally {
    await context?.close()
  }
}

async function runNavigateSmoke(
  platform: 'youtube' | 'instagram',
  profile: string,
  headed: boolean,
  screenshot: boolean,
): Promise<void> {
  const useHeaded = headed || !config.PLAYWRIGHT_HEADLESS
  let context

  try {
    context = await launchAuthenticatedContext(profile, { headless: !useHeaded })
    const page = await context.newPage()

    if (platform === 'youtube') {
      await page.goto('https://www.youtube.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await humanReadingPause()
      await humanScroll(page)
      await page.goto('https://studio.youtube.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await humanReadingPause()
    } else {
      await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await humanReadingPause()
      await humanScroll(page)
    }

    const challenge = await detectLoginOrChallenge(page)
    if (challenge.loginRequired) {
      fail(`Platform challenge detected (${challenge.challengeType})`, challenge.reason)
    }

    pass(`${platform} navigation OK — session appears authenticated`)

    if (screenshot) {
      const outDir = path.join(config.TMP_DIR, 'playwright-smoke')
      await fs.mkdir(outDir, { recursive: true })
      const outPath = path.join(outDir, `${platform}-smoke-${Date.now()}.png`)
      await page.screenshot({ path: outPath, fullPage: false })
      pass(`Screenshot saved to ${outPath} (review locally, do not commit)`)
    }
  } finally {
    await context?.close()
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2))
  const effectiveHeadless = opts.headed ? false : config.PLAYWRIGHT_HEADLESS

  console.log('Playwright uploader smoke test')
  console.log(`  headless: ${effectiveHeadless}`)
  console.log(`  channel: ${config.PLAYWRIGHT_CHANNEL?.trim() || 'bundled-chromium'}`)
  console.log(`  slowMo: ${config.PLAYWRIGHT_SLOW_MO_MS}ms`)
  console.log(`  action delay: ${config.PLAYWRIGHT_ACTION_DELAY_MIN_MS}-${config.PLAYWRIGHT_ACTION_DELAY_MAX_MS}ms`)
  console.log(`  reading delay: ${config.PLAYWRIGHT_READING_DELAY_MIN_MS}-${config.PLAYWRIGHT_READING_DELAY_MAX_MS}ms`)
  console.log(`  real uploads enabled: ${config.REAL_UPLOADS_ENABLED}`)

  if (opts.checkInstall) {
    await checkPlaywrightInstall()
    return
  }

  if (opts.launchHeaded) {
    await runHeadedLaunchSmoke()
    console.log('\nSmoke test PASSED')
    return
  }

  if (!opts.profile) {
    fail('Provide --profile <slug-or-path> (e.g. memes-yt) or use --check-install / --launch-headed')
  }

  const profilePath = await resolveProfilePath(opts.profile)
  console.log(`  profile resolved: ${profilePath}`)

  if (opts.login) {
    const platform = opts.platform ?? inferPlatformFromProfile(profilePath)
    if (!platform) {
      fail(
        'Could not infer platform from profile name. Use --platform youtube or --platform instagram (profile slugs should end with -yt or -ig).',
      )
    }
    await runLoginSetup(platform, profilePath)
  }

  if (opts.session) {
    await runSessionCheck(profilePath, opts.accountId, opts.headed)
  }

  if (opts.navigate) {
    await runNavigateSmoke(opts.navigate, profilePath, opts.headed, opts.screenshot)
  }

  if (!opts.login && !opts.session && !opts.navigate) {
    fail('Specify --login, --session, and/or --navigate youtube|instagram')
  }

  console.log('\nSmoke test PASSED')
}

main().catch((err) => {
  console.error('Smoke test error:', err)
  process.exit(1)
})
