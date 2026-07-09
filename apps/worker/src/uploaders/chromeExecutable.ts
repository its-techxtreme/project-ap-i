import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * Resolve installed Google Chrome for manual profile login.
 * Google blocks sign-in in Playwright bundled Chromium — real Chrome is required for login.
 */
export async function findChromeExecutable(customPath?: string): Promise<string | null> {
  if (customPath?.trim()) {
    try {
      await fs.access(customPath.trim())
      return customPath.trim()
    } catch {
      return null
    }
  }

  const localAppData = process.env.LOCALAPPDATA ?? ''
  const candidates = [
    process.env.PLAYWRIGHT_CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter((value): value is string => Boolean(value))

  for (const candidate of candidates) {
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      // try next
    }
  }

  return null
}

export function loginStartUrl(platform: 'youtube' | 'instagram'): string {
  if (platform === 'youtube') {
    return 'https://accounts.google.com/signin/v2/identifier?continue=https%3A%2F%2Fstudio.youtube.com%2F'
  }
  return 'https://www.instagram.com/accounts/login/'
}
