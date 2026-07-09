import path from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.spec.ts'],
    env: {
      NODE_ENV: 'test',
      REAL_UPLOADS_ENABLED: 'false',
      WORKER_BASE_URL: 'http://localhost:3001',
      WORKER_INTERNAL_TOKEN: 'test-worker-internal-token-min-32-chars',
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key-not-a-real-secret',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-not-a-real-secret',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
