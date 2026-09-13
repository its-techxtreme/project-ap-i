export type PreviewCard = {
  x: number
  y: number
  followingText: string
  href: string
}

/** Img/video pass can miss a tile. Keep href-only cards that sit on a different Y band. */
export function mergePreviewCards(mapped: PreviewCard[], paneHrefs: PreviewCard[]): PreviewCard[] {
  const extra = paneHrefs.filter((p) => {
    if (!p.href) return false
    return !mapped.some((c) => Math.abs(c.y - p.y) < 40)
  })
  return [...mapped, ...extra]
}
