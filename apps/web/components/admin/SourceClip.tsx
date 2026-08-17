import { instagramEmbedUrl } from '@project-api/shared'

function youtubeThumbUrl(sourceUrl: string): string | null {
  try {
    const url = new URL(sourceUrl)
    const host = url.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0]
      return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null
    }
    if (!host.includes('youtube.com')) return null
    const shorts = url.pathname.match(/\/shorts\/([^/]+)/)
    if (shorts?.[1]) return `https://img.youtube.com/vi/${shorts[1]}/mqdefault.jpg`
    const v = url.searchParams.get('v')
    return v ? `https://img.youtube.com/vi/${v}/mqdefault.jpg` : null
  } catch {
    return null
  }
}

export function SourceClip({
  sourceUrl,
  sourcePlatform,
  compact = false,
}: {
  sourceUrl: string
  sourcePlatform: string
  compact?: boolean
}) {
  const frameClass = compact
    ? 'h-28 w-[72px] rounded border border-border/70 bg-muted/30'
    : 'aspect-[9/16] w-full max-h-[420px] rounded-md border border-border/70 bg-muted/30'

  if (sourcePlatform === 'instagram') {
    const embed = instagramEmbedUrl(sourceUrl)
    if (!embed) {
      return (
        <a href={sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
          Open reel
        </a>
      )
    }
    return (
      <iframe
        title="Source reel"
        src={embed}
        className={frameClass}
        loading="lazy"
        allow="encrypted-media; clipboard-write"
      />
    )
  }

  const thumb = youtubeThumbUrl(sourceUrl)
  if (thumb) {
    return (
      <a href={sourceUrl} target="_blank" rel="noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumb} alt="Source clip" className={compact ? 'h-28 w-[72px] rounded object-cover' : 'w-full max-w-sm rounded-md'} />
      </a>
    )
  }

  return (
    <a href={sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
      Open source
    </a>
  )
}
