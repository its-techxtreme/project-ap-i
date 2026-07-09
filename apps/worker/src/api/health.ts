import type { FastifyInstance } from 'fastify'

import { config } from '../config'

function detectPlaywright(): 'installed' | 'not_installed' {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('playwright')
    return 'installed'
  } catch {
    return 'not_installed'
  }
}

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request, reply) => {
    return reply.send({
      ok: true,
      version: '0.1.0',
      env: config.NODE_ENV,
      realUploadsEnabled: config.REAL_UPLOADS_ENABLED,
      youtubeUploadsEnabled: config.YOUTUBE_UPLOADS_ENABLED,
      instagramUploadsEnabled: config.INSTAGRAM_UPLOADS_ENABLED,
      checks: {
        supabase: 'not_checked',
        ffmpeg: 'not_installed',
        ytDlp: 'not_installed',
        playwright: detectPlaywright(),
        playwrightChannel: config.PLAYWRIGHT_CHANNEL ?? 'chromium',
        playwrightProfilesDir: config.PLAYWRIGHT_PROFILES_DIR ?? 'default_repo_playwright-profiles',
      },
    })
  })
}
