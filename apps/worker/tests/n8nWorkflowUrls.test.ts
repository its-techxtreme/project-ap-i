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

  it('WF-06 uses status=eq.active and account_label', () => {
    const raw = fs.readFileSync(path.join(workflowsDir, 'WF-06_account_health_check.json'), 'utf8')
    expect(raw).toContain('status=eq.active')
    expect(raw).toContain('account_label')
    expect(raw).not.toContain('is_active=eq.true')
    expect(raw).not.toContain('display_name')
  })
})
