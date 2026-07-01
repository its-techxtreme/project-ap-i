import { logger } from '../logging/logger'

import type { PlatformUploader, SessionHealth, UploadInput, UploadResult } from './types'

export class MockUploader implements PlatformUploader {
  private readonly shouldFail: boolean

  constructor(options?: { shouldFail?: boolean }) {
    this.shouldFail = options?.shouldFail ?? false
  }

  async checkSession(_accountId: string, _profilePath?: string): Promise<SessionHealth> {
    return { healthy: true }
  }

  async upload(input: UploadInput): Promise<UploadResult> {
    logger.info({
      msg: `[MOCK] ${input.platform} upload`,
      jobId: input.jobId,
      account: input.account.accountLabel,
    })

    if (this.shouldFail) {
      return {
        success: false,
        errorCode: `${input.platform.toUpperCase()}_UPLOAD_FAILED`,
        errorMessage: '[MOCK] Simulated upload failure',
      }
    }

    return {
      success: true,
      platformMediaId: `mock-${input.platform}-${input.jobId}`,
      platformUrl: `https://${input.platform}.com/mock/${input.jobId}`,
    }
  }
}
