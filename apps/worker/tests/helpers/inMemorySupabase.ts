import { randomUUID } from 'node:crypto'

type Row = Record<string, unknown>

export const DRY_RUN_NICHES = {
  memes: { id: '11111111-1111-4111-8111-111111111111', slug: 'memes', name: 'Memes' },
  anime: { id: '22222222-2222-4222-8222-222222222222', slug: 'anime', name: 'Anime' },
  sports: { id: '33333333-3333-4333-8333-333333333333', slug: 'sports', name: 'Sports' },
} as const

export type DryRunNicheSlug = keyof typeof DRY_RUN_NICHES

class QueryBuilder {
  private filters: Array<{ column: string; value: unknown }> = []
  private selectedColumns: string[] | null = null
  private pendingInsert: Row | null = null
  private pendingUpdate: Row | null = null
  private operation: 'select' | 'insert' | 'update' | null = null
  private insertSelectColumns: string[] | null = null

  constructor(
    private readonly db: InMemorySupabase,
    private readonly table: string,
  ) {}

  select(columns = '*'): this {
    if (this.operation === 'insert') {
      this.insertSelectColumns = columns === '*' ? null : columns.split(',').map((c) => c.trim())
      return this
    }
    this.operation = 'select'
    this.selectedColumns = columns === '*' ? null : columns.split(',').map((c) => c.trim())
    return this
  }

  insert(row: Row): this {
    this.operation = 'insert'
    this.pendingInsert = row
    return this
  }

  update(row: Row): this {
    this.operation = 'update'
    this.pendingUpdate = row
    return this
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ column, value })
    return this
  }

  async single(): Promise<{ data: Row | null; error: { message: string } | null }> {
    if (this.operation === 'insert' && this.pendingInsert) {
      const row = { id: randomUUID(), ...this.pendingInsert }
      this.db.tables[this.table].push(row)
      return { data: this.projectRow(row, this.insertSelectColumns), error: null }
    }

    const rows = this.db.filterRows(this.table, this.filters)
    if (rows.length === 0) {
      return { data: null, error: { message: 'Row not found' } }
    }

    if (this.operation === 'update' && this.pendingUpdate) {
      Object.assign(rows[0], this.pendingUpdate)
      return { data: this.projectRow(rows[0]), error: null }
    }

    return { data: this.projectRow(rows[0], this.selectedColumns), error: null }
  }

  then<TResult1 = { data: Row[] | Row | null; error: { message: string } | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[] | Row | null; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<{ data: Row[] | Row | null; error: { message: string } | null }> {
    if (this.operation === 'insert' && this.pendingInsert) {
      const row = { id: randomUUID(), ...this.pendingInsert }
      this.db.tables[this.table].push(row)
      return { data: row, error: null }
    }

    const rows = this.db.filterRows(this.table, this.filters)

    if (this.operation === 'update' && this.pendingUpdate) {
      if (rows.length === 0) {
        return { data: null, error: { message: 'Row not found' } }
      }
      for (const row of rows) {
        Object.assign(row, this.pendingUpdate)
      }
      return { data: null, error: null }
    }

    const projected = rows.map((row) => this.projectRow(row, this.selectedColumns))
    return { data: projected, error: null }
  }

  private projectRow(row: Row, columns: string[] | null = this.selectedColumns): Row {
    if (!columns) return { ...row }
    const projected: Row = {}
    for (const column of columns) {
      projected[column] = row[column]
    }
    return projected
  }
}

export class InMemorySupabase {
  readonly tables: Record<string, Row[]> = {
    jobs: [],
    job_events: [],
    upload_attempts: [],
    audit_logs: [],
    niches: [],
    platform_accounts: [],
  }

  reset(): void {
    for (const key of Object.keys(this.tables)) {
      this.tables[key] = []
    }
    this.seedNichesAndAccounts()
  }

  seedNichesAndAccounts(): void {
    for (const niche of Object.values(DRY_RUN_NICHES)) {
      this.tables.niches.push({
        id: niche.id,
        slug: niche.slug,
        name: niche.name,
        is_active: true,
      })

      this.tables.platform_accounts.push(
        {
          id: `${niche.slug}-yt`,
          niche_id: niche.id,
          platform: 'youtube',
          account_label: `${niche.name} YT`,
          browser_profile_path: null,
          status: 'active',
          login_required: false,
        },
        {
          id: `${niche.slug}-ig`,
          niche_id: niche.id,
          platform: 'instagram',
          account_label: `${niche.name} IG`,
          browser_profile_path: null,
          status: 'active',
          login_required: false,
        },
      )
    }
  }

  from(table: string): QueryBuilder {
    return new QueryBuilder(this, table)
  }

  async rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: Row | null; error: { message: string } | null }> {
    if (fn !== 'claim_next_job') {
      return { data: null, error: { message: `Unknown rpc: ${fn}` } }
    }

    const workerId = args.worker_id as string
    const lockMinutes = (args.lock_minutes as number) ?? 45
    const queued = this.tables.jobs.find((job) => job.status === 'queued')
    if (!queued) {
      return { data: null, error: null }
    }

    const now = new Date()
    const lockExpires = new Date(now.getTime() + lockMinutes * 60_000)
    Object.assign(queued, {
      status: 'locked',
      locked_by: workerId,
      locked_at: now.toISOString(),
      lock_expires_at: lockExpires.toISOString(),
    })

    return { data: { ...queued }, error: null }
  }

  filterRows(table: string, filters: Array<{ column: string; value: unknown }>): Row[] {
    return this.tables[table].filter((row) =>
      filters.every((filter) => row[filter.column] === filter.value),
    )
  }

  createQueuedJob(input: {
    nicheSlug: DryRunNicheSlug
    sourceUrl?: string
  }): Row {
    const niche = DRY_RUN_NICHES[input.nicheSlug]
    const sourceUrl = input.sourceUrl ?? `https://www.youtube.com/shorts/dry-run-${niche.slug}-${Date.now()}`
    const now = new Date().toISOString()

    const job: Row = {
      id: randomUUID(),
      public_job_code: `DRY-${niche.slug.toUpperCase()}`,
      source_url: sourceUrl,
      normalized_source_url: sourceUrl,
      source_platform: 'youtube',
      niche_id: niche.id,
      rights_confirmed: true,
      status: 'queued',
      download_status: 'pending',
      processing_status: 'pending',
      metadata_status: 'pending',
      youtube_upload_status: 'pending',
      instagram_upload_status: 'pending',
      verification_status: 'pending',
      retry_count: 0,
      youtube_retry_count: 0,
      instagram_retry_count: 0,
      created_at: now,
      updated_at: now,
    }

    this.tables.jobs.push(job)
    return job
  }

  getJob(jobId: string): Row | undefined {
    return this.tables.jobs.find((job) => job.id === jobId)
  }
}

export function createSupabaseAdminMock(db: InMemorySupabase) {
  return {
    from: (table: string) => db.from(table),
    rpc: (fn: string, args: Record<string, unknown>) => db.rpc(fn, args),
  }
}
