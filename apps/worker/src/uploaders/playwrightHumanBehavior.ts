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
  await locator.scrollIntoViewIfNeeded()
  await humanPause(800, 2000)

  const box = await locator.boundingBox()
  if (box) {
    const x = box.x + box.width * (0.2 + Math.random() * 0.6)
    const y = box.y + box.height * (0.2 + Math.random() * 0.6)
    await page.mouse.move(x, y, { steps: randomInt(16, 36) })
    await humanPause(300, 800)
    await page.mouse.click(x, y, { delay: randomInt(80, 220) })
    await humanPause(500, 1400)
    return
  }

  await locator.click({ delay: randomInt(100, 250) })
  await humanPause(500, 1400)
}

export async function humanType(locator: Locator, text: string, options?: { clearFirst?: boolean }): Promise<void> {
  await locator.scrollIntoViewIfNeeded()
  await humanPause(600, 1600)

  if (options?.clearFirst) {
    await locator.click({ delay: randomInt(80, 180) })
    await humanPause(200, 500)
    await locator.press('Control+A')
    await humanPause(250, 600)
    await locator.press('Backspace')
    await humanPause(400, 1000)
  }

  let index = 0
  while (index < text.length) {
    const chunkSize = randomInt(3, 9)
    const chunk = text.slice(index, index + chunkSize)
    const delay = randomInt(config.PLAYWRIGHT_TYPING_DELAY_MIN_MS, config.PLAYWRIGHT_TYPING_DELAY_MAX_MS)
    await locator.pressSequentially(chunk, { delay })
    index += chunkSize

    if (index < text.length) {
      await humanPause(350, 1800)
    }
  }

  await humanPause(1200, 3000)
}

export async function humanSetFiles(locator: Locator): Promise<void> {
  await humanPause(1500, 3500)
  await locator.scrollIntoViewIfNeeded()
  await humanPause(1000, 2500)
}
