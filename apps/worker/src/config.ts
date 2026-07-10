import { z } from 'zod'

const configSchema = z.object({
  PORT: z.string().default('3001').transform(Number),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  WORKER_INTERNAL_TOKEN: z.string().min(32),

  REAL_UPLOADS_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  YOUTUBE_UPLOADS_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  INSTAGRAM_UPLOADS_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  PLAYWRIGHT_HEADLESS: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  PLAYWRIGHT_SLOW_MO_MS: z.string().default('200').transform(Number),
  PLAYWRIGHT_CHANNEL: z.string().optional(),
  PLAYWRIGHT_CHROME_PATH: z.string().optional(),
  PLAYWRIGHT_PROFILES_DIR: z.string().optional(),
  PLAYWRIGHT_TYPING_DELAY_MIN_MS: z.string().default('120').transform(Number),
  PLAYWRIGHT_TYPING_DELAY_MAX_MS: z.string().default('280').transform(Number),
  PLAYWRIGHT_ACTION_DELAY_MIN_MS: z.string().default('2500').transform(Number),
  PLAYWRIGHT_ACTION_DELAY_MAX_MS: z.string().default('6000').transform(Number),
  PLAYWRIGHT_READING_DELAY_MIN_MS: z.string().default('3500').transform(Number),
  PLAYWRIGHT_READING_DELAY_MAX_MS: z.string().default('9000').transform(Number),

  MAX_FFMPEG_CONCURRENCY: z.string().default('1').transform(Number),
  MAX_DOWNLOAD_CONCURRENCY: z.string().default('2').transform(Number),
  JOB_LOCK_MINUTES: z.string().default('45').transform(Number),
  VERIFY_DELAY_MINUTES: z.string().default('30').transform(Number),

  WATERMARK_PATH: z.string().default('/app/assets/watermark.png'),
  /** Directory containing memes.png / anime.png / sports.png (niche watermarks). */
  WATERMARKS_DIR: z.string().optional(),
  TMP_DIR: z.string().default('/app/tmp/jobs'),

  MAX_SOURCE_DURATION_SECONDS: z.string().default('180').transform(Number),
  MAX_SOURCE_FILE_SIZE_MB: z.string().default('500').transform(Number),
  INTEGRATION_TESTS_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  GOOGLE_DRIVE_CLIENT_ID: z.string().optional(),
  GOOGLE_DRIVE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_DRIVE_REFRESH_TOKEN: z.string().optional(),
  GOOGLE_DRIVE_ROOT_FOLDER_ID: z.string().optional(),
  GOOGLE_DRIVE_PROCESSED_FOLDER_ID: z.string().optional(),
  GOOGLE_DRIVE_FAILED_FOLDER_ID: z.string().optional(),

  AI_PROVIDER_BASE_URL: z.string().optional(),
  AI_PROVIDER_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),
})

const envForParse = {
  ...process.env,
  PORT: process.env.PORT ?? process.env.WORKER_PORT ?? '3001',
}

const parsed = configSchema.safeParse(envForParse)
if (!parsed.success) {
  console.error('Worker config validation failed:', parsed.error.flatten())
  process.exit(1)
}

export const config = parsed.data

/** Real uploads require installed Google Chrome — never bundled Chromium. */
if (config.REAL_UPLOADS_ENABLED) {
  const channel = (config.PLAYWRIGHT_CHANNEL ?? '').trim().toLowerCase()
  if (channel !== 'chrome') {
    console.error(
      'Worker config validation failed: REAL_UPLOADS_ENABLED=true requires PLAYWRIGHT_CHANNEL=chrome',
    )
    process.exit(1)
  }
}
