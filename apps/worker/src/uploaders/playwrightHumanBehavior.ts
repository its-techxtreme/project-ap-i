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

/** Sit for a bit like someone actually reading the page. */
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

/** Type caption once. Old fallback typed the whole string again and doubled it. */
export async function humanType(
  locator: Locator,
  text: string,
  options?: { clearFirst?: boolean },
): Promise<void> {
  const page = locator.page()
  const value = text.normalize('NFC')

  await locator.waitFor({ state: 'attached', timeout: 60_000 })
  await locator.scrollIntoViewIfNeeded().catch(() => undefined)
  await humanPause(600, 1600)

  await locator.click({ delay: randomInt(80, 180), force: true }).catch(async () => {
    await locator.focus()
  })
  await humanPause(200, 500)

  if (options?.clearFirst !== false) {
    await clearEditableField(locator)
  }

  const tagName = await locator.evaluate((el) => el.tagName.toLowerCase()).catch(() => '')
  const isNativeInput = tagName === 'input' || tagName === 'textarea'

  if (isNativeInput) {
    // fill() replaces the whole value. Safer than typing on native inputs.
    await locator.fill(value)
    await humanPause(400, 900)
    return
  }

  // YT Studio / IG caption boxes. Keyboard once, never a second full type.
  const delay = randomInt(
    Math.max(30, Math.min(config.PLAYWRIGHT_TYPING_DELAY_MIN_MS, 80)),
    Math.max(50, Math.min(config.PLAYWRIGHT_TYPING_DELAY_MAX_MS, 140)),
  )

  try {
    await page.keyboard.type(value, { delay })
  } catch {
    // Do not append. Clear, then set the value once.
    await clearEditableField(locator)
    await setContentEditableText(locator, value)
  }

  const current = await readEditableText(locator)
  if (isDuplicatedMetadataText(current, value)) {
    await clearEditableField(locator)
    await setContentEditableText(locator, value)
  }

  await humanPause(800, 1800)
}

async function clearEditableField(locator: Locator): Promise<void> {
  const page = locator.page()
  await locator.click({ clickCount: 3, delay: randomInt(40, 100) }).catch(() => undefined)
  await humanPause(80, 200)
  await page.keyboard.press('Control+A').catch(() => undefined)
  await humanPause(60, 150)
  await page.keyboard.press('Backspace').catch(() => undefined)
  await humanPause(100, 250)
  await locator
    .evaluate((el) => {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        el.value = ''
        el.dispatchEvent(new Event('input', { bubbles: true }))
        return
      }
      el.textContent = ''
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContent' }))
    })
    .catch(() => undefined)
  await humanPause(150, 350)
}

async function setContentEditableText(locator: Locator, value: string): Promise<void> {
  await locator
    .evaluate((el, t) => {
      el.focus()
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        el.value = t
      } else {
        el.textContent = t
      }
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: t }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }, value)
    .catch(() => undefined)
}

async function readEditableText(locator: Locator): Promise<string> {
  return locator
    .evaluate((el) => {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value
      return (el as HTMLElement).innerText || el.textContent || ''
    })
    .catch(() => '')
}

/** True if the field looks like we typed the title/caption twice. */
export function isDuplicatedMetadataText(actual: string, expected: string): boolean {
  const a = actual.replace(/\s+/g, ' ').trim()
  const e = expected.replace(/\s+/g, ' ').trim()
  if (!e || a === e) return false

  // Expected text shows up twice in a row.
  let from = 0
  let hits = 0
  while (from <= a.length) {
    const idx = a.indexOf(e, from)
    if (idx < 0) break
    hits += 1
    from = idx + Math.max(1, Math.floor(e.length / 2))
    if (hits >= 2) return true
  }

  // Started over after almost finishing the first pass.
  const probe = e.slice(0, Math.min(48, e.length))
  if (probe.length >= 12) {
    const first = a.indexOf(probe)
    const second = first >= 0 ? a.indexOf(probe, first + probe.length) : -1
    if (first >= 0 && second > first) return true
  }

  return a.length > e.length * 1.35
}


/** Pause before setInputFiles. Hidden file inputs break if we scrollIntoView. */
export async function humanSetFiles(_locator?: Locator): Promise<void> {
  await humanPause(800, 1800)
}

/** First selector that is actually attached and usable. */
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
