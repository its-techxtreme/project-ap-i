import type { DbJobRow } from '../db/jobsRepo'
import { claimNextJob } from '../db/jobsRepo'

export async function claimJob(workerId: string): Promise<DbJobRow | null> {
  return claimNextJob(workerId)
}
