import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

import { config } from '../config'
import { logger } from '../logging/logger'

/** Service role client — must never be exposed in HTTP responses. */
export const supabaseAdmin = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  // Node 20 requires ws for Supabase realtime transport initialization.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  realtime: { transport: ws as any },
})

logger.info({ msg: 'Supabase admin client initialized' })
