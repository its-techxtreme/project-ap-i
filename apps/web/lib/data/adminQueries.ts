import { endOfDayIso, sanitizePartialUuid } from '@/lib/format/dateFilters'
import { formatRelativeTime } from '@/lib/format/relativeTime'
import { pickLatestSuccessfulUpload, resolveUploadHref } from '@/lib/format/uploadRefs'
import { supabaseAdmin } from '@/lib/supabase/admin'

const PROCESSING_STATUSES = [
  'locked',
  'validating',
  'downloading',
  'downloaded',
  'processing',
  'processed',
  'staging_to_drive',
  'ready_to_upload',
  'uploading',
  'awaiting_verification',
] as const

function startOfTodayIso(): string {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return now.toISOString()
}

async function loadPlatformUrlsByJobId(
  jobIds: string[],
): Promise<Map<string, { youtube_url: string | null; instagram_url: string | null }>> {
  const map = new Map<string, { youtube_url: string | null; instagram_url: string | null }>()
  for (const id of jobIds) {
    map.set(id, { youtube_url: null, instagram_url: null })
  }
  if (jobIds.length === 0) return map

  const { data } = await supabaseAdmin
    .from('upload_attempts')
    .select('job_id, platform, status, platform_url, platform_media_id, finished_at')
    .in('job_id', jobIds)
    .eq('status', 'uploaded')
    .order('finished_at', { ascending: false })

  const attempts = data ?? []
  for (const jobId of jobIds) {
    const forJob = attempts.filter((a) => a.job_id === jobId)
    const yt = pickLatestSuccessfulUpload(forJob, 'youtube')
    const ig = pickLatestSuccessfulUpload(forJob, 'instagram')
    map.set(jobId, {
      youtube_url: yt ? resolveUploadHref(yt) : null,
      instagram_url: ig ? resolveUploadHref(ig) : null,
    })
  }
  return map
}

export type JobSummary = {
  queued: number
  processing: number
  completedToday: number
  failedToday: number
  needsManualReview: number
  loginRequiredAccounts: number
  driveWaitingCleanup: number
}

export type JobFilters = {
  status?: string[]
  nicheId?: string
  sourcePlatform?: string
  youtubeUploadStatus?: string
  instagramUploadStatus?: string
  dateFrom?: string
  dateTo?: string
}

export type LogFilters = {
  jobId?: string
  action?: string
  eventType?: string
  dateFrom?: string
  dateTo?: string
  severity?: string
}

export type JobListRow = {
  id: string
  created_at: string
  created_at_label: string
  source_platform: string
  niche_id: string
  niche_name: string
  status: string
  youtube_upload_status: string
  instagram_upload_status: string
  youtube_url: string | null
  instagram_url: string | null
  drive_view_url: string | null
  retry_count: number
  failure_reason: string | null
  failure_code: string | null
  source_url: string
  /** 1-based FIFO position among waiting jobs (queued / ready_to_upload), else null. */
  queue_position: number | null
}

export type JobEventRow = {
  id: string
  job_id: string | null
  stage: string | null
  event_type: string
  severity: string
  message: string | null
  created_at: string
  created_at_label: string
}

export type FailedJobRow = JobListRow

export type PlatformAccountRow = {
  id: string
  niche_id: string
  niche_name: string
  platform: string
  account_label: string
  status: string
  login_required: boolean
  last_successful_upload_at: string | null
  last_successful_upload_label: string | null
  failure_count: number
  browser_profile_path: string | null
}

export type AuditLogRow = {
  id: string
  created_at: string
  created_at_label: string
  actor_user_id: string | null
  actor_email: string | null
  action: string
  target_type: string | null
  target_id: string | null
  ip_address: string | null
}

export async function getJobSummary(): Promise<JobSummary> {
  const todayStart = startOfTodayIso()

  const [
    queuedRes,
    processingRes,
    completedTodayRes,
    failedTodayRes,
    needsReviewRes,
    loginRequiredRes,
    driveCleanupRes,
  ] = await Promise.all([
    supabaseAdmin.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'queued'),
    supabaseAdmin
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .in('status', [...PROCESSING_STATUSES]),
    supabaseAdmin
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('completed_at', todayStart),
    supabaseAdmin
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .in('status', ['failed', 'needs_manual_review'])
      .gte('updated_at', todayStart),
    supabaseAdmin
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'needs_manual_review'),
    supabaseAdmin
      .from('platform_accounts')
      .select('id', { count: 'exact', head: true })
      .or('login_required.eq.true,status.eq.login_required'),
    supabaseAdmin
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .not('drive_file_id', 'is', null)
      .is('drive_deleted_at', null)
      // Match Failed Review: actionable leftovers only (not cancelled archives).
      .in('status', ['failed', 'needs_manual_review'])
      .or('drive_folder_state.is.null,drive_folder_state.neq.deleted'),
  ])

  return {
    queued: queuedRes.count ?? 0,
    processing: processingRes.count ?? 0,
    completedToday: completedTodayRes.count ?? 0,
    failedToday: failedTodayRes.count ?? 0,
    needsManualReview: needsReviewRes.count ?? 0,
    loginRequiredAccounts: loginRequiredRes.count ?? 0,
    driveWaitingCleanup: driveCleanupRes.count ?? 0,
  }
}

export async function getRecentJobEvents(limit = 10): Promise<JobEventRow[]> {
  const { data, error } = await supabaseAdmin
    .from('job_events')
    .select('id, job_id, stage, event_type, severity, message, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []).map((row) => ({
    ...row,
    created_at_label: formatRelativeTime(row.created_at),
  }))
}

export async function getJobs(
  filters: JobFilters,
  page: number,
  pageSize: number,
): Promise<{ jobs: JobListRow[]; total: number }> {
  let query = supabaseAdmin
    .from('jobs')
    .select(
      'id, created_at, source_platform, niche_id, status, youtube_upload_status, instagram_upload_status, drive_view_url, retry_count, youtube_retry_count, instagram_retry_count, failure_reason, failure_code, source_url, niches(name)',
      { count: 'exact' },
    )

  if (filters.status?.length) {
    query = query.in('status', filters.status)
  }
  if (filters.nicheId) {
    query = query.eq('niche_id', filters.nicheId)
  }
  if (filters.sourcePlatform) {
    query = query.eq('source_platform', filters.sourcePlatform)
  }
  if (filters.youtubeUploadStatus) {
    query = query.eq('youtube_upload_status', filters.youtubeUploadStatus)
  }
  if (filters.instagramUploadStatus) {
    query = query.eq('instagram_upload_status', filters.instagramUploadStatus)
  }
  if (filters.dateFrom) {
    query = query.gte('created_at', filters.dateFrom)
  }
  if (filters.dateTo) {
    query = query.lte('created_at', endOfDayIso(filters.dateTo))
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) throw error

  const rows = data ?? []
  const urlMap = await loadPlatformUrlsByJobId(rows.map((row) => row.id))

  const waitingIds = new Set(
    rows.filter((r) => r.status === 'queued' || r.status === 'ready_to_upload').map((r) => r.id),
  )
  const queuePositionById = new Map<string, number>()
  if (waitingIds.size > 0) {
    const { data: waiting } = await supabaseAdmin
      .from('jobs')
      .select('id')
      .in('status', ['queued', 'ready_to_upload'])
      .order('created_at', { ascending: true })
    let pos = 1
    for (const row of waiting ?? []) {
      queuePositionById.set(row.id, pos++)
    }
  }

  const jobs: JobListRow[] = rows.map((row) => {
    const niche = row.niches as { name: string } | { name: string }[] | null
    const nicheName = Array.isArray(niche) ? niche[0]?.name : niche?.name
    const urls = urlMap.get(row.id) ?? { youtube_url: null, instagram_url: null }

    return {
      id: row.id,
      created_at: row.created_at,
      created_at_label: formatRelativeTime(row.created_at),
      source_platform: row.source_platform,
      niche_id: row.niche_id,
      niche_name: nicheName ?? 'Unknown',
      status: row.status,
      youtube_upload_status: row.youtube_upload_status,
      instagram_upload_status: row.instagram_upload_status,
      youtube_url: urls.youtube_url,
      instagram_url: urls.instagram_url,
      drive_view_url: row.drive_view_url,
      retry_count: Math.max(
        Number(row.retry_count ?? 0),
        Number(row.youtube_retry_count ?? 0),
        Number(row.instagram_retry_count ?? 0),
      ),
      failure_reason: row.failure_reason,
      failure_code: row.failure_code ?? null,
      source_url: row.source_url,
      queue_position: queuePositionById.get(row.id) ?? null,
    }
  })

  return { jobs, total: count ?? 0 }
}

export async function getJobDetail(jobId: string) {
  const { data: job, error: jobError } = await supabaseAdmin
    .from('jobs')
    .select('*, niches(name, slug)')
    .eq('id', jobId)
    .single()

  if (jobError || !job) return null

  const [{ data: submitter }, { data: youtubeAccount }, { data: instagramAccount }] =
    await Promise.all([
      job.submitted_by
        ? supabaseAdmin
            .from('profiles')
            .select('email, full_name')
            .eq('id', job.submitted_by)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      job.target_youtube_account_id
        ? supabaseAdmin
            .from('platform_accounts')
            .select('account_label, platform')
            .eq('id', job.target_youtube_account_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      job.target_instagram_account_id
        ? supabaseAdmin
            .from('platform_accounts')
            .select('account_label, platform')
            .eq('id', job.target_instagram_account_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ])

  const { data: uploadAttempts } = await supabaseAdmin
    .from('upload_attempts')
    .select('*')
    .eq('job_id', jobId)
    .order('started_at', { ascending: false })

  const { data: jobEvents } = await supabaseAdmin
    .from('job_events')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true })
    .limit(50)

  return {
    job: {
      ...job,
      submitter,
      youtube_account: youtubeAccount,
      instagram_account: instagramAccount,
    },
    uploadAttempts: uploadAttempts ?? [],
    jobEvents: jobEvents ?? [],
  }
}

export async function getFailedJobs(): Promise<FailedJobRow[]> {
  const { data, error } = await supabaseAdmin
    .from('jobs')
    .select(
      'id, created_at, source_platform, niche_id, status, youtube_upload_status, instagram_upload_status, drive_view_url, retry_count, youtube_retry_count, instagram_retry_count, failure_reason, failure_code, source_url, niches(name)',
    )
    .in('status', ['failed', 'needs_manual_review'])
    .order('updated_at', { ascending: false })

  if (error) throw error

  const rows = data ?? []
  const urlMap = await loadPlatformUrlsByJobId(rows.map((row) => row.id))

  return rows.map((row) => {
    const niche = row.niches as { name: string } | { name: string }[] | null
    const nicheName = Array.isArray(niche) ? niche[0]?.name : niche?.name
    const urls = urlMap.get(row.id) ?? { youtube_url: null, instagram_url: null }

    return {
      id: row.id,
      created_at: row.created_at,
      created_at_label: formatRelativeTime(row.created_at),
      source_platform: row.source_platform,
      niche_id: row.niche_id,
      niche_name: nicheName ?? 'Unknown',
      status: row.status,
      youtube_upload_status: row.youtube_upload_status,
      instagram_upload_status: row.instagram_upload_status,
      youtube_url: urls.youtube_url,
      instagram_url: urls.instagram_url,
      drive_view_url: row.drive_view_url,
      retry_count: Math.max(
        Number(row.retry_count ?? 0),
        Number(row.youtube_retry_count ?? 0),
        Number(row.instagram_retry_count ?? 0),
      ),
      failure_reason: row.failure_reason,
      failure_code: row.failure_code,
      source_url: row.source_url,
      queue_position: null,
    }
  })
}

export async function getPlatformAccounts(): Promise<PlatformAccountRow[]> {
  const { data, error } = await supabaseAdmin
    .from('platform_accounts')
    .select(
      'id, niche_id, platform, account_label, status, login_required, last_successful_upload_at, failure_count, browser_profile_path, niches(name)',
    )
    .order('niche_id')
    .order('platform')

  if (error) throw error

  return (data ?? []).map((row) => {
    const niche = row.niches as { name: string } | { name: string }[] | null
    const nicheName = Array.isArray(niche) ? niche[0]?.name : niche?.name

    return {
      id: row.id,
      niche_id: row.niche_id,
      niche_name: nicheName ?? 'Unknown',
      platform: row.platform,
      account_label: row.account_label,
      status: row.status,
      login_required: row.login_required,
      last_successful_upload_at: row.last_successful_upload_at,
      last_successful_upload_label: row.last_successful_upload_at
        ? formatRelativeTime(row.last_successful_upload_at)
        : null,
      failure_count: row.failure_count,
      browser_profile_path: row.browser_profile_path,
    }
  })
}

export async function getAuditLogs(
  filters: LogFilters,
  page: number,
  pageSize = 25,
): Promise<{ logs: AuditLogRow[]; total: number }> {
  let query = supabaseAdmin
    .from('audit_logs')
    .select('id, created_at, actor_user_id, action, target_type, target_id, ip_address', {
      count: 'exact',
    })

  const jobIdFilter = filters.jobId ? sanitizePartialUuid(filters.jobId) : undefined
  if (jobIdFilter) {
    query = query.ilike('target_id', `%${jobIdFilter}%`)
  }
  if (filters.action) {
    query = query.eq('action', filters.action)
  }
  if (filters.dateFrom) {
    query = query.gte('created_at', filters.dateFrom)
  }
  if (filters.dateTo) {
    query = query.lte('created_at', endOfDayIso(filters.dateTo))
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) throw error

  const actorIds = [
    ...new Set((data ?? []).map((row) => row.actor_user_id).filter(Boolean)),
  ] as string[]

  const emailByUserId = new Map<string, string>()
  if (actorIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .in('id', actorIds)

    for (const profile of profiles ?? []) {
      if (profile.email) emailByUserId.set(profile.id, profile.email)
    }
  }

  const logs: AuditLogRow[] = (data ?? []).map((row) => ({
    id: row.id,
    created_at: row.created_at,
    created_at_label: formatRelativeTime(row.created_at),
    actor_user_id: row.actor_user_id,
    actor_email: row.actor_user_id ? (emailByUserId.get(row.actor_user_id) ?? null) : null,
    action: row.action,
    target_type: row.target_type,
    target_id: row.target_id,
    ip_address: row.ip_address,
  }))

  return { logs, total: count ?? 0 }
}

export async function getJobEventsForLogs(
  filters: LogFilters,
  page: number,
  pageSize = 25,
): Promise<{ events: JobEventRow[]; total: number }> {
  let query = supabaseAdmin
    .from('job_events')
    .select('id, job_id, stage, event_type, severity, message, created_at', { count: 'exact' })

  const jobIdFilter = filters.jobId ? sanitizePartialUuid(filters.jobId) : undefined
  if (jobIdFilter) {
    query = query.ilike('job_id', `%${jobIdFilter}%`)
  }
  if (filters.eventType) {
    query = query.eq('event_type', filters.eventType)
  }
  if (filters.severity) {
    query = query.eq('severity', filters.severity)
  }
  if (filters.dateFrom) {
    query = query.gte('created_at', filters.dateFrom)
  }
  if (filters.dateTo) {
    query = query.lte('created_at', endOfDayIso(filters.dateTo))
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) throw error

  return {
    events: (data ?? []).map((row) => ({
      ...row,
      created_at_label: formatRelativeTime(row.created_at),
    })),
    total: count ?? 0,
  }
}

export async function getSystemSettings(): Promise<Record<string, unknown>> {
  const { data, error } = await supabaseAdmin.from('system_settings').select('key, value')

  if (error) throw error

  const settings: Record<string, unknown> = {}
  for (const row of data ?? []) {
    settings[row.key] = row.value
  }
  return settings
}

export type CollectorInboxRow = {
  id: string
  source_url: string
  normalized_source_url: string
  sender_username: string | null
  status: string
  created_at: string
  created_at_label: string
}

export async function getPendingCollectorInbox(): Promise<CollectorInboxRow[]> {
  const { data, error } = await supabaseAdmin
    .from('collector_inbox_items')
    .select('id, source_url, normalized_source_url, sender_username, status, created_at')
    .eq('status', 'pending_niche')
    .order('created_at', { ascending: true })
    .limit(100)

  if (error) throw error

  return (data ?? []).map((row) => ({
    ...row,
    created_at_label: formatRelativeTime(row.created_at),
  }))
}

export async function getActiveNiches(): Promise<{ id: string; name: string; slug: string }[]> {
  const { data, error } = await supabaseAdmin
    .from('niches')
    .select('id, name, slug')
    .eq('is_active', true)
    .order('name')

  if (error) throw error
  return data ?? []
}

export type PlatformAccountCard = {
  account_label: string
  status: string | null
  handle: string | null
  profile_url: string | null
  display_name: string | null
  description: string | null
  avatar_url: string | null
}

export type NicheMappingRow = {
  id: string
  name: string
  slug: string
  is_active: boolean
  /** @deprecated Prefer youtube / instagram cards */
  youtube_label: string | null
  youtube_status: string | null
  instagram_label: string | null
  instagram_status: string | null
  youtube: PlatformAccountCard | null
  instagram: PlatformAccountCard | null
}

export async function getNicheAccountMappings(): Promise<NicheMappingRow[]> {
  const { data: niches, error } = await supabaseAdmin
    .from('niches')
    .select('id, name, slug, is_active')
    .order('name')

  if (error) throw error

  const { data: accounts, error: accountsError } = await supabaseAdmin
    .from('platform_accounts')
    .select('niche_id, platform, account_label, username_hint, status')
    .neq('status', 'disabled')

  if (accountsError) throw accountsError

  const {
    getLivePlatformProfile,
    profileUrlFor,
    resolveProfileHandle,
  } = await import('@/lib/data/fetchPlatformProfile')

  return Promise.all(
    (niches ?? []).map(async (niche) => {
      const yt = (accounts ?? []).find(
        (a) => a.niche_id === niche.id && a.platform === 'youtube',
      )
      const ig = (accounts ?? []).find(
        (a) => a.niche_id === niche.id && a.platform === 'instagram',
      )

      async function enrich(
        platform: 'youtube' | 'instagram',
        row:
          | {
              account_label: string
              username_hint: string | null
              status: string
            }
          | undefined,
      ): Promise<PlatformAccountCard | null> {
        if (!row) return null
        const handle = resolveProfileHandle(platform, row.username_hint, niche.slug)
        const live = handle ? await getLivePlatformProfile(platform, handle) : null
        return {
          account_label: row.account_label,
          status: row.status,
          handle: handle ?? null,
          profile_url: handle ? profileUrlFor(platform, handle) : null,
          display_name: live?.displayName ?? row.account_label,
          description: live?.description ?? null,
          avatar_url: live?.avatarUrl ?? null,
        }
      }

      const [youtube, instagram] = await Promise.all([
        enrich('youtube', yt),
        enrich('instagram', ig),
      ])

      return {
        id: niche.id,
        name: niche.name,
        slug: niche.slug,
        is_active: niche.is_active,
        youtube_label: youtube?.account_label ?? null,
        youtube_status: youtube?.status ?? null,
        instagram_label: instagram?.account_label ?? null,
        instagram_status: instagram?.status ?? null,
        youtube,
        instagram,
      }
    }),
  )
}
