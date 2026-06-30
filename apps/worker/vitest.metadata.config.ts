import { readFileSync } from 'node:fs'
import path from 'node:path'

import { defineConfig } from 'vitest/config'

/** Load .env into process.env before worker config module is first imported. */
function loadDotEnv(filePath: string): void {
  try {
    const content = readFileSync(filePath, 'utf8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (!process.env[key]) {
        process.env[key] = value
      }
    }
  } catch {
    // Integration tests skip when credentials are unavailable.
  }
}

loadDotEnv(path.resolve(__dirname, '../../.env'))

export default defineConfig({
  test: {
    include: ['tests/metadata.integration.test.ts'],
    testTimeout: 60_000,
  },
  resolve: {
    alias: {
      '@project-api/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
})
