import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const workflowsDir = path.resolve(__dirname, '../../../infra/n8n/workflows')

describe('n8n workflow worker URLs', () => {
  const files = fs.readdirSync(workflowsDir).filter((f) => f.endsWith('.json'))

  it('all workflow JSON files exist including WF-08', () => {
    expect(files).toContain('WF-08_verification_cron.json')
    expect(files).toContain('WF-01_new_job_poller.json')
  })

  it('worker HTTP nodes use $env.WORKER_BASE_URL (no hardcoded docker hostname)', () => {
    for (const file of files) {
      const raw = fs.readFileSync(path.join(workflowsDir, file), 'utf8')
      expect(raw, file).not.toContain('http://worker:3001')
      if (raw.includes('/jobs/') || raw.includes('/admin-commands/')) {
        expect(raw, file).toContain('$env.WORKER_BASE_URL')
      }
    }
  })

  it('WF-08 drains pending ready_to_upload and crash-stuck retries', () => {
    const raw = fs.readFileSync(path.join(workflowsDir, 'WF-08_verification_cron.json'), 'utf8')
    expect(raw).toContain('Query Pending Uploads')
    expect(raw).toContain('/upload')
    expect(raw).toContain('status=in.(ready_to_upload,uploading)')
    expect(raw).toContain('youtube_upload_status=eq.pending')
    expect(raw).toContain('failure_code=is.null')
  })
})
