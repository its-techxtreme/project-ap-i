/** Formats a timestamp as yyyyMMdd_HHmm for Drive file names. */
export function formatDriveTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`
}

/** Builds the canonical Drive file name: AP-I_<niche>_<jobId>_<timestamp>.mp4 */
export function buildDriveFileName(nicheSlug: string, jobId: string, date = new Date()): string {
  const ts = formatDriveTimestamp(date)
  return `AP-I_${nicheSlug}_${jobId}_${ts}.mp4`
}
