import path from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/**/*.integration.test.ts'],
    env: {
      NODE_ENV: 'test',
      PORT: '3001',
      SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-not-a-real-secret',
      WORKER_INTERNAL_TOKEN: 'test-worker-internal-token-min-32-chars',
      REAL_UPLOADS_ENABLED: 'false',
      PLAYWRIGHT_HEADLESS: 'true',
      PLAYWRIGHT_SLOW_MO_MS: '0',
      PLAYWRIGHT_TYPING_DELAY_MIN_MS: '1',
      PLAYWRIGHT_TYPING_DELAY_MAX_MS: '2',
      PLAYWRIGHT_ACTION_DELAY_MIN_MS: '1',
      PLAYWRIGHT_ACTION_DELAY_MAX_MS: '2',
      PLAYWRIGHT_READING_DELAY_MIN_MS: '1',
      PLAYWRIGHT_READING_DELAY_MAX_MS: '2',
      INTEGRATION_TESTS_ENABLED: 'false',
      TMP_DIR: '/tmp/jobs-test',
    },
  },
  resolve: {
    alias: {
      '@project-api/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
})
