/** Newest reel/post URL from an IG Playwright profile. */
import { chromium } from 'playwright'

import { normalizeInstagramMediaUrl } from '../src/uploaders/platformMediaIds'

async function main() {
  const profilePath = process.argv[2]
  const username = process.argv[3]?.replace(/^@/, '')

  if (!profilePath) {
    console.error('Usage: capture-latest-ig-reel.ts <profilePath> [username]')
    process.exit(1)
  }

  const channel = process.env.PLAYWRIGHT_CHANNEL || 'chrome'
  const context = await chromium.launchPersistentContext(profilePath, {
    channel,
    headless: false,
    viewport: null,
    args: ['--no-first-run', '--no-default-browser-check'],
  })

  try {
    const page = context.pages()[0] || (await context.newPage())
    const target = username
      ? `https://www.instagram.com/${username}/reels/`
      : 'https://www.instagram.com/'
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForTimeout(4500)

    if (!username) {
      const profile = page.locator('span:has-text("Profile"), a[role="link"]:has-text("Profile")').first()
      if (await profile.isVisible({ timeout: 5000 }).catch(() => false)) {
        await profile.click()
        await page.waitForTimeout(3000)
      }
      const reelsTab = page.locator('a[href*="/reels/"], [role="tab"]:has-text("Reels")').first()
      if (await reelsTab.isVisible({ timeout: 5000 }).catch(() => false)) {
        await reelsTab.click()
        await page.waitForTimeout(3000)
      }
    }

    const candidates = page.locator('a[href*="/reel/"], a[href*="/p/"], a[href*="/tv/"]')
    const count = await candidates.count()
    const urls: string[] = []
    for (let i = 0; i < Math.min(count, 8); i++) {
      const href = await candidates.nth(i).getAttribute('href')
      const normalized = href ? normalizeInstagramMediaUrl(href) : null
      if (normalized && !urls.includes(normalized)) urls.push(normalized)
    }

    console.log(
      JSON.stringify(
        { ok: true, pageUrl: page.url(), latest: urls[0] ?? null, candidates: urls },
        null,
        2,
      ),
    )
  } finally {
    await context.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
