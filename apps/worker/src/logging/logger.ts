import pino from 'pino'

import { config } from '../config'

export const logger = pino({
  level: config.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: [
    'req.headers.authorization',
    'req.headers["x-worker-token"]',
    'body.serviceRoleKey',
    'body.apiKey',
    '*.password',
    '*.token',
    '*.refreshToken',
    '*.accessToken',
    '*.serviceRoleKey',
    '*.SUPABASE_SERVICE_ROLE_KEY',
    '*.AI_PROVIDER_API_KEY',
  ],
})
