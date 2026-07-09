import type { Locator, Page } from 'playwright'

import { config } from '../config'

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export async function humanPause(minMs?: number, maxMs?: number): Promise<void> {
  const min = minMs ?? config.PLAYWRIGHT_ACTION_DELAY_MIN_MS
  const max = maxMs ?? config.PLAYWRIGHT_ACTION_DELAY_MAX_MS
  const delay = randomInt(min, max)
  await new Promise((resolve) => setTimeout(resolve, delay))
}

/** Longer pause simulating a user reading the page before acting. */
export async function humanReadingPause(): Promise<void> {
  await humanPause(config.PLAYWRIGHT_READING_DELAY_MIN_MS, config.PLAYWRIGHT_READING_DELAY_MAX_MS)
}

export async function humanIdleMotion(page: Page): Promise<void> {
  const viewport = page.viewportSize() ?? { width: 1366, height: 768 }
  const x = randomInt(80, Math.max(120, viewport.width - 80))
  const y = randomInt(80, Math.max(120, viewport.height - 80))
  await page.mouse.move(x, y, { steps: randomInt(18, 40) })
  await humanPause(400, 1200)
}

export async function humanScroll(page: Page): Promise<void> {
  const deltaY = randomInt(80, 320) * (Math.random() > 0.5 ? 1 : -1)
  await page.mouse.wheel(0, deltaY)
  await humanPause(1200, 2800)
}

export async function humanClick(page: Page, locator: Locator): Promise<void> {
  await locator.scrollIntoViewIfNeeded().catch(() => undefined)
  await humanPause(800, 2000)

  const box = await locator.boundingBox().catch(() => null)
  if (box) {
    const x = box.x + box.width * (0.2 + Math.random() * 0.6)
    const y = box.y + box.height * (0.2 + Math.random() * 0.6)
    await page.mouse.move(x, y, { steps: randomInt(16, 36) })
    await humanPause(300, 800)
    await page.mouse.click(x, y, { delay: randomInt(80, 220) })
    await humanPause(500, 1400)
    return
  }

  await locator.click({ delay: randomInt(100, 250), force: true })
  await humanPause(500, 1400)
}

/**
 * Type into textarea/input OR contenteditable (#textbox in YouTube Studio / IG caption).
 */
export async function humanType(
  locator: Locator,
  text: string,
  options?: { clearFirst?: boolean },
): Promise<void> {
  await locator.waitFor({ state: 'attached', timeout: 60_000 })
  await locator.scrollIntoViewIfNeeded().catch(() => undefined)
  await humanPause(600, 1600)

  await locator.click({ delay: randomInt(80, 180), force: true }).catch(async () => {
    await locator.focus()
  })
  await humanPause(200, 500)

  if (options?.clearFirst !== false) {
    await locator.press('Control+A').catch(() => undefined)
    await humanPause(150, 400)
    await locator.press('Backspace').catch(() => undefined)
    await humanPause(300, 700)
  }

  // Contenteditable fields often ignore pressSequentially on the outer node —
  // prefer keyboard.type after focus.
  const delay = randomInt(config.PLAYWRIGHT_TYPING_DELAY_MIN_MS, config.PLAYWRIGHT_TYPING_DELAY_MAX_MS)
  try {
    await locator.pressSequentially(text, { delay })
  } catch {
    const page = locator.page()
    await page.keyboard.type(text, { delay })
  }

  await humanPause(1200, 3000)
}

/**
 * Pause before setInputFiles.
 * Do NOT scrollIntoView — file inputs are often hidden/opacity:0 and scroll fails.
 */
export async function humanSetFiles(_locator?: Locator): Promise<void> {
  await humanPause(800, 1800)
}

/** First attached+usable locator from a list of CSS/text selectors. */
export async function firstAttached(
  page: Page,
  selectors: string[],
  timeoutMs = 45_000,
): Promise<Locator> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const loc = page.locator(selector).first()
      if (await loc.count().catch(() => 0)) {
        const attached = await loc
          .waitFor({ state: 'attached', timeout: 500 })
          .then(() => true)
          .catch(() => false)
        if (attached) return loc
      }
    }
    await humanPause(400, 800)
  }
  throw new Error(`None of the selectors attached within ${timeoutMs}ms: ${selectors.join(' | ')}`)
}

export async function clickFirstVisible(
  page: Page,
  selectors: string[],
  timeoutMs = 20_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const loc = page.locator(selector).first()
      if (await loc.isVisible().catch(() => false)) {
        await humanClick(page, loc)
        return true
      }
    }
    await humanPause(400, 900)
  }
  return false
}
