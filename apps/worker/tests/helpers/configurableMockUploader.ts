import type { PlatformUploader, SessionHealth, UploadInput, UploadResult } from '../../src/uploaders/types'

export interface UploaderFailureConfig {
  /** Platforms that should fail (all attempts). */
  alwaysFail?: Array<'youtube' | 'instagram'>
  /** Platforms that fail only for the first N attempts per job. */
  failFirstAttempts?: Partial<Record<'youtube' | 'instagram', number>>
}

export class ConfigurableMockUploader implements PlatformUploader {
  private readonly attemptCounts = new Map<string, number>()
  readonly uploadCalls: UploadInput[] = []

  constructor(private readonly config: UploaderFailureConfig = {}) {}

  async checkSession(): Promise<SessionHealth> {
    return { healthy: true }
  }

  async upload(input: UploadInput): Promise<UploadResult> {
    this.uploadCalls.push(input)

    const key = `${input.jobId}:${input.platform}`
    const attempt = (this.attemptCounts.get(key) ?? 0) + 1
    this.attemptCounts.set(key, attempt)

    const alwaysFail = this.config.alwaysFail?.includes(input.platform)
    const failFirst = this.config.failFirstAttempts?.[input.platform] ?? 0
    const shouldFail = alwaysFail || attempt <= failFirst

    if (shouldFail) {
      return {
        success: false,
        errorCode: `${input.platform.toUpperCase()}_UPLOAD_FAILED`,
        errorMessage: `[MOCK] Simulated ${input.platform} upload failure (attempt ${attempt})`,
      }
    }

    return {
      success: true,
      platformMediaId: `mock-${input.platform}-${input.jobId}`,
      platformUrl: `https://${input.platform}.com/mock/${input.jobId}`,
    }
  }
}
