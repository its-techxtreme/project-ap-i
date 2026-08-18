export function parseCollectorThreadIds(raw: string | undefined): string[] {
  if (!raw?.trim()) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(/[,;\s]+/)) {
    const id = part.trim()
    if (!/^\d{6,}$/.test(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}
