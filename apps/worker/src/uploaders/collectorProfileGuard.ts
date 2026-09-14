import path from 'node:path'

import { config } from '../config'

/** Never launch an upload Chrome on the harvest profile. */
export function isCollectorBrowserProfile(profilePath: string): boolean {
  const base = path.basename(profilePath.replace(/\\/g, '/')).toLowerCase()
  return base === config.COLLECTOR_PROFILE.toLowerCase()
}
