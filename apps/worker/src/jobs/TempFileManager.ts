import fs from 'node:fs/promises'
import path from 'node:path'

import { config } from '../config'
import { logger } from '../logging/logger'

export class TempFileManager {
  private readonly baseDir: string

  constructor() {
    this.baseDir = config.TMP_DIR
  }

  async createJobDir(jobId: string): Promise<string> {
    const dir = path.join(this.baseDir, jobId)
    await fs.mkdir(dir, { recursive: true })
    logger.debug({ msg: 'Created job temp dir', jobId, dir })
    return dir
  }

  async cleanupJobDir(jobId: string): Promise<void> {
    const dir = path.join(this.baseDir, jobId)
    try {
      await fs.rm(dir, { recursive: true, force: true })
      logger.info({ msg: 'Cleaned up job temp dir', jobId, dir })
    } catch (err) {
      logger.warn({ msg: 'Failed to clean temp dir', jobId, dir, err })
    }
  }

  getOutputPath(jobId: string): string {
    return path.join(this.baseDir, jobId, `job_${jobId}_edited.mp4`)
  }
}
