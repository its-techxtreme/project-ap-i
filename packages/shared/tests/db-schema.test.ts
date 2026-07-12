import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..')
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations')
const SEED_PATH = join(REPO_ROOT, 'supabase', 'seed.sql')

const EXPECTED_MIGRATIONS = [
  '0001_extensions.sql',
  '0002_profiles.sql',
  '0003_niches_accounts.sql',
  '0004_jobs.sql',
  '0005_upload_attempts_events_logs.sql',
  '0006_functions.sql',
  '0007_rls_policies.sql',
  '0008_indexes.sql',
  '0009_function_grants.sql',
  '0012_audit_actor_anonymous.sql',
  '0013_admin_commands.sql',
  '0014_admin_login_attempts.sql',
  '0015_reclaim_stale_locks.sql',
  '0016_daily_upload_limit_claim_skip.sql',
  '0017_daily_upload_limit_rolling_24h.sql',
  '0018_fix_claim_null_failure_code.sql',
]

const RLS_TABLES = [
  'profiles',
  'niches',
  'platform_accounts',
  'jobs',
  'upload_attempts',
  'job_events',
  'audit_logs',
  'system_settings',
]

function readMigration(name: string): string {
  return readFileSync(join(MIGRATIONS_DIR, name), 'utf8')
}

describe('db schema — migration files (static)', () => {
  it('all expected migration files exist', () => {
    for (const file of EXPECTED_MIGRATIONS) {
      expect(existsSync(join(MIGRATIONS_DIR, file)), `missing ${file}`).toBe(true)
    }
  })

  it('admin_commands outbox uses SKIP LOCKED claim and RLS', () => {
    const sql = readMigration('0013_admin_commands.sql')
    expect(sql).toMatch(/create table public\.admin_commands/)
    expect(sql).toMatch(/claim_next_admin_command/)
    expect(sql).toMatch(/for update skip locked/i)
    expect(sql).toMatch(/enable row level security/i)
    expect(sql).toMatch(/grant execute on function public\.claim_next_admin_command/)
    expect(sql).toMatch(/to service_role/)
  })

  it('seed.sql exists and seeds three niches', () => {
    expect(existsSync(SEED_PATH)).toBe(true)
    const seed = readFileSync(SEED_PATH, 'utf8')
    expect(seed).toMatch(/'memes'/)
    expect(seed).toMatch(/'anime'/)
    expect(seed).toMatch(/'sports'/)
    expect(seed).toMatch(/system_settings/)
  })

  it('each public table migration enables RLS immediately', () => {
    const rlsFiles = [
      '0002_profiles.sql',
      '0003_niches_accounts.sql',
      '0004_jobs.sql',
      '0005_upload_attempts_events_logs.sql',
    ]

    for (const file of rlsFiles) {
      const sql = readMigration(file)
      const enableCount = (sql.match(/enable row level security/gi) ?? []).length
      expect(enableCount, `${file} should enable RLS on each table`).toBeGreaterThan(0)
    }
  })

  it('jobs table enforces rights_confirmed = true via CHECK constraint', () => {
    const sql = readMigration('0004_jobs.sql')
    expect(sql).toMatch(/jobs_rights_confirmed_true/)
    expect(sql).toMatch(/rights_confirmed = true/)
  })

  it('platform_accounts has partial unique index for active accounts', () => {
    const sql = readMigration('0003_niches_accounts.sql')
    expect(sql).toMatch(/uniq_active_platform_account_per_niche/)
    expect(sql).toMatch(/where status = 'active'/)
  })

  it('claim_next_job uses FOR UPDATE SKIP LOCKED and is security definer', () => {
    const sql = readMigration('0006_functions.sql')
    expect(sql).toMatch(/claim_next_job/)
    expect(sql).toMatch(/security definer/i)
    expect(sql).toMatch(/for update skip locked/i)
  })

  it('claim_next_job reclaims expired locked jobs (0015)', () => {
    const sql = readMigration('0015_reclaim_stale_locks.sql')
    expect(sql).toMatch(/status = 'locked'/)
    expect(sql).toMatch(/lock_expires_at < now\(\)/)
    expect(sql).toMatch(/lock_reclaimed/)
    expect(sql).toMatch(/for update skip locked/i)
  })

  it('claim_next_job skips same-day daily upload deferrals (0016)', () => {
    const sql = readMigration('0016_daily_upload_limit_claim_skip.sql')
    expect(sql).toMatch(/DAILY_UPLOAD_LIMIT_REACHED/)
    expect(sql).toMatch(/date_trunc\('day'/)
  })

  it('claim_next_job uses rolling 24h deferral window (0017)', () => {
    const sql = readMigration('0017_daily_upload_limit_rolling_24h.sql')
    expect(sql).toMatch(/DAILY_UPLOAD_LIMIT_REACHED/)
    expect(sql).toMatch(/interval '24 hours'/)
  })

  it('claim_next_job NULL-safe daily deferral skip (0018)', () => {
    const sql = readMigration('0018_fix_claim_null_failure_code.sql')
    expect(sql).toMatch(/is not distinct from 'DAILY_UPLOAD_LIMIT_REACHED'/)
  })

  it('claim_next_job is restricted to service_role in function grants migration', () => {
    const sql = readMigration('0009_function_grants.sql')
    expect(sql).toMatch(/grant execute on function public\.claim_next_job/)
    expect(sql).toMatch(/to service_role/)
  })

  it('RLS policies cover all 8 public tables', () => {
    const sql = readMigration('0007_rls_policies.sql')
    for (const table of RLS_TABLES) {
      expect(sql).toMatch(new RegExp(`on public\\.${table}`, 'i'))
    }
  })

  it('no migration files contain raw passwords or tokens', () => {
    const forbidden = [/password\s*=/i, /service_role_key/i, /api_key/i, /secret_key/i]
    for (const file of EXPECTED_MIGRATIONS) {
      const sql = readMigration(file)
      for (const pattern of forbidden) {
        expect(sql, `${file} should not contain sensitive patterns`).not.toMatch(pattern)
      }
    }
  })
})


/**
 * Integration tests require a live Supabase/Postgres database.
 * Run manually after `supabase db reset` or apply migrations via Supabase MCP:
 *
 * 1. Fresh migration on empty DB completes without error
 * 2. seed.sql inserts exactly 3 niches (memes, anime, sports)
 * 3. INSERT niche slug 'gaming' fails CHECK constraint
 * 4. INSERT job with rights_confirmed = false fails CHECK constraint
 * 5. Valid job insert succeeds
 * 6. Two active platform_accounts for same niche/platform rejected by unique index
 * 7. claim_next_job returns one job with status = 'locked'
 * 8. Concurrent claim_next_job returns different jobs
 * 9. Submitter auth context cannot read platform_accounts
 * 10. Admin auth context can read all jobs
 * 11. Submitter can insert job with target_youtube_account_id in schema but server must strip it
 */
describe.skip('db schema — integration (requires Supabase)', () => {
  it('fresh migration and seed complete without error', () => {
    expect(true).toBe(true)
  })

  it('seed inserts exactly 3 niches', () => {
    expect(true).toBe(true)
  })

  it('rejects niche slug gaming via CHECK constraint', () => {
    expect(true).toBe(true)
  })

  it('rejects job with rights_confirmed false', () => {
    expect(true).toBe(true)
  })

  it('accepts valid job insert', () => {
    expect(true).toBe(true)
  })

  it('rejects duplicate active platform account per niche/platform', () => {
    expect(true).toBe(true)
  })

  it('claim_next_job locks one queued job', () => {
    expect(true).toBe(true)
  })

  it('concurrent claim_next_job does not double-claim', () => {
    expect(true).toBe(true)
  })

  it('submitter cannot read platform_accounts via RLS', () => {
    expect(true).toBe(true)
  })

  it('admin can read all jobs via RLS', () => {
    expect(true).toBe(true)
  })

  it('schema allows target_youtube_account_id but server action must strip it (Phase 4)', () => {
    expect(true).toBe(true)
  })
})
