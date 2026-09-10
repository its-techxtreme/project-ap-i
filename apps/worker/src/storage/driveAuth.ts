import fs from 'node:fs'
import path from 'node:path'

import { ERROR_CODES, ProjectApiError } from '@project-api/shared'
import { google } from 'googleapis'
import type { drive_v3 } from 'googleapis'

import { config } from '../config'
import { logger } from '../logging/logger'

export type DriveAuthMode = 'service_account' | 'oauth' | 'unconfigured'

export type DriveAuthProbe = {
  ok: boolean
  mode: DriveAuthMode
  detail: string
  checkedAt: number
}

const TTL_OK_MS = 5 * 60_000
const TTL_FAIL_MS = 60_000

let cachedProbe: DriveAuthProbe | null = null

function resolveServiceAccountPath(): string | null {
  const raw = config.GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE?.trim()
  if (!raw) return null
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw)
}

export function getDriveAuthMode(): DriveAuthMode {
  if (resolveServiceAccountPath()) return 'service_account'
  if (
    config.GOOGLE_DRIVE_CLIENT_ID &&
    config.GOOGLE_DRIVE_CLIENT_SECRET &&
    config.GOOGLE_DRIVE_REFRESH_TOKEN
  ) {
    return 'oauth'
  }
  return 'unconfigured'
}

export function isDriveAuthErrorMessage(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('invalid_grant') ||
    lower.includes('token has been expired or revoked') ||
    lower.includes('invalid_client') ||
    lower.includes('unauthorized_client') ||
    lower.includes('invalid credentials') ||
    lower.includes('login required') ||
    (lower.includes('401') && lower.includes('auth'))
  )
}

export function classifyDriveError(
  err: unknown,
  action: 'upload' | 'download' | 'delete' | 'probe' = 'upload',
): ProjectApiError {
  if (err instanceof ProjectApiError) return err
  const msg = err instanceof Error ? err.message : String(err)
  if (isDriveAuthErrorMessage(msg)) {
    markDriveAuthFailed(msg)
    return new ProjectApiError(
      ERROR_CODES.DRIVE_AUTH_FAILED,
      `Google Drive auth failed (${action}): ${msg}. Re-authorize Drive or switch to a service account (see infra/google-drive/SETUP.md).`,
      { stage: 'staging_to_drive', retryable: false },
    )
  }
  const code =
    action === 'delete' ? ERROR_CODES.DRIVE_DELETE_FAILED : ERROR_CODES.DRIVE_UPLOAD_FAILED
  return new ProjectApiError(code, `Drive ${action} failed: ${msg}`, {
    stage: action === 'delete' ? 'cleanup' : 'staging_to_drive',
    retryable: true,
  })
}

export function markDriveAuthFailed(detail: string): void {
  cachedProbe = {
    ok: false,
    mode: getDriveAuthMode(),
    detail: detail.slice(0, 300),
    checkedAt: Date.now(),
  }
  logger.error({
    msg: 'Drive auth circuit opened — stopping new pipeline claims until credentials are fixed',
    detail: cachedProbe.detail,
    mode: cachedProbe.mode,
  })
}

export function clearDriveAuthCircuit(): void {
  cachedProbe = null
}

export function getCachedDriveAuthProbe(): DriveAuthProbe | null {
  return cachedProbe
}

function cacheStillValid(probe: DriveAuthProbe): boolean {
  const age = Date.now() - probe.checkedAt
  return age < (probe.ok ? TTL_OK_MS : TTL_FAIL_MS)
}

/** Build googleapis auth client (service account preferred over user OAuth). */
export function createDriveGoogleAuth():
  | InstanceType<typeof google.auth.GoogleAuth>
  | InstanceType<typeof google.auth.OAuth2> {
  const saPath = resolveServiceAccountPath()
  if (saPath) {
    if (!fs.existsSync(saPath)) {
      throw new ProjectApiError(
        ERROR_CODES.DRIVE_AUTH_FAILED,
        `GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE not found: ${saPath}`,
        { stage: 'staging_to_drive', retryable: false },
      )
    }
    return new google.auth.GoogleAuth({
      keyFile: saPath,
      scopes: ['https://www.googleapis.com/auth/drive'],
    })
  }

  const clientId = config.GOOGLE_DRIVE_CLIENT_ID
  const clientSecret = config.GOOGLE_DRIVE_CLIENT_SECRET
  const refreshToken = config.GOOGLE_DRIVE_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) {
    throw new ProjectApiError(
      ERROR_CODES.DRIVE_AUTH_FAILED,
      'Google Drive credentials are not configured (set GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE or OAuth client/refresh token)',
      { stage: 'staging_to_drive', retryable: false },
    )
  }

  const oauth = new google.auth.OAuth2(clientId, clientSecret)
  oauth.setCredentials({ refresh_token: refreshToken })
  return oauth
}

export function createDriveApiClient(): drive_v3.Drive {
  const auth = createDriveGoogleAuth()
  return google.drive({ version: 'v3', auth })
}

/**
 * Lightweight credential probe (token refresh / about.get).
 * Results are cached so a dead token does not hammer Google or fail the whole queue.
 */
export async function probeDriveAuth(force = false): Promise<DriveAuthProbe> {
  if (!force && cachedProbe && cacheStillValid(cachedProbe)) {
    return cachedProbe
  }

  const mode = getDriveAuthMode()
  if (mode === 'unconfigured') {
    cachedProbe = {
      ok: false,
      mode,
      detail: 'Drive credentials not configured',
      checkedAt: Date.now(),
    }
    return cachedProbe
  }

  try {
    const drive = createDriveApiClient()
    await drive.about.get({ fields: 'user/emailAddress' })
    cachedProbe = {
      ok: true,
      mode,
      detail: mode === 'service_account' ? 'service_account_ok' : 'oauth_refresh_ok',
      checkedAt: Date.now(),
    }
    return cachedProbe
  } catch (err: unknown) {
    const classified = classifyDriveError(err, 'probe')
    cachedProbe = {
      ok: false,
      mode,
      detail: classified.message.slice(0, 300),
      checkedAt: Date.now(),
    }
    return cachedProbe
  }
}

/** True when Drive auth is known-good. */
export async function isDriveAuthHealthy(force = false): Promise<boolean> {
  const probe = await probeDriveAuth(force)
  return probe.ok
}
