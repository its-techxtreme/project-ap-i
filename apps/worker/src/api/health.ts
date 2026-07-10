import fs from 'node:fs/promises'
import type { FastifyInstance } from 'fastify'

import { config } from '../config'
import { supabaseAdmin } from '../db/supabaseAdmin'
import { runCommand } from '../utils/runCommand'

type CheckResult = { ok: boolean; detail?: string }

async function checkFfmpeg(): Promise<CheckResult> {
  try {
    const { stdout } = await runCommand('ffmpeg', ['-version'], { timeout: 10_000 })
    const first = stdout.split(/\r?\n/)[0] ?? 'ffmpeg'
    return { ok: true, detail: first.slice(0, 120) }
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) }
  }
}

async function checkYtDlp(): Promise<CheckResult> {
  try {
    const { stdout } = await runCommand('yt-dlp', ['--version'], { timeout: 15_000 })
    return { ok: true, detail: stdout.trim().slice(0, 80) }
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) }
  }
}

async function checkDisk(): Promise<CheckResult> {
  try {
    await fs.mkdir(config.TMP_DIR, { recursive: true })
    const probe = `${config.TMP_DIR}/.health-write-${Date.now()}`
    await fs.writeFile(probe, 'ok')
    await fs.unlink(probe)
    return { ok: true, detail: config.TMP_DIR }
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) }
  }
}

async function checkSupabase(): Promise<CheckResult> {
  try {
    const { error } = await supabaseAdmin.from('jobs').select('id').limit(1)
    if (error) return { ok: false, detail: error.message }
    return { ok: true }
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) }
  }
}

function detectPlaywright(): 'installed' | 'not_installed' {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('playwright')
    return 'installed'
  } catch {
    return 'not_installed'
  }
}

function checkChromeChannel(): CheckResult {
  const channel = (config.PLAYWRIGHT_CHANNEL ?? '').trim().toLowerCase()
  if (!config.REAL_UPLOADS_ENABLED) {
    return { ok: true, detail: channel || 'n/a (uploads disabled)' }
  }
  if (channel !== 'chrome') {
    return {
      ok: false,
      detail: `REAL_UPLOADS_ENABLED requires PLAYWRIGHT_CHANNEL=chrome (got "${channel || 'unset'}")`,
    }
  }
  return { ok: true, detail: 'chrome' }
}

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request, reply) => {
    const isTest = config.NODE_ENV === 'test'

    const [ffmpeg, ytDlp, disk, supabase] = isTest
      ? [
          { ok: true, detail: 'skipped_in_test' } satisfies CheckResult,
          { ok: true, detail: 'skipped_in_test' } satisfies CheckResult,
          { ok: true, detail: 'skipped_in_test' } satisfies CheckResult,
          { ok: true, detail: 'skipped_in_test' } satisfies CheckResult,
        ]
      : await Promise.all([checkFfmpeg(), checkYtDlp(), checkDisk(), checkSupabase()])

    const chrome = checkChromeChannel()
    const playwright = detectPlaywright()

    const ok =
      ffmpeg.ok &&
      ytDlp.ok &&
      disk.ok &&
      supabase.ok &&
      chrome.ok &&
      (isTest || playwright === 'installed')

    return reply.status(ok ? 200 : 503).send({
      ok,
      version: '0.1.0',
      env: config.NODE_ENV,
      realUploadsEnabled: config.REAL_UPLOADS_ENABLED,
      youtubeUploadsEnabled: config.YOUTUBE_UPLOADS_ENABLED,
      instagramUploadsEnabled: config.INSTAGRAM_UPLOADS_ENABLED,
      verifyDelayMinutes: config.VERIFY_DELAY_MINUTES,
      checks: {
        supabase,
        ffmpeg,
        ytDlp,
        disk,
        playwright,
        playwrightChannel: config.PLAYWRIGHT_CHANNEL ?? 'unset',
        chromeChannel: chrome,
        playwrightProfilesDir: config.PLAYWRIGHT_PROFILES_DIR ?? 'default_repo_playwright-profiles',
      },
    })
  })
}
