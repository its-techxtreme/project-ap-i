import path from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      PORT: '3001',
      SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-not-a-real-secret',
      WORKER_INTERNAL_TOKEN: 'test-worker-internal-token-min-32-chars',
      REAL_UPLOADS_ENABLED: 'false',
    },
  },
  resolve: {
    alias: {
      '@project-api/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
})
