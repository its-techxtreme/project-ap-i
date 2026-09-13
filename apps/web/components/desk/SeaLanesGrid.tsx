import { StatusBadge } from '@/components/app/StatusBadge'
import type { NicheMappingRow, PlatformAccountCard } from '@/lib/data/adminQueries'
import { cn } from '@/lib/utils'

function PlatformCard({
  platform,
  account,
}: {
  platform: 'youtube' | 'instagram'
  account: PlatformAccountCard | null
}) {
  if (!account) {
    return (
      <div className="rounded-md border border-dashed border-border/70 bg-muted/20 px-3 py-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          {platform === 'youtube' ? 'YouTube' : 'Instagram'}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">Not mapped</p>
      </div>
    )
  }

  const label = platform === 'youtube' ? 'YouTube' : 'Instagram'
  const name = account.display_name ?? account.account_label
  const handle = account.handle ? `@${account.handle}` : null
  const initial = (name || handle || label).slice(0, 1).toUpperCase()

  return (
    <article
      className={cn(
        'flex gap-3 rounded-md border border-border/70 bg-card/55 p-3',
        'transition-colors hover:border-primary/35',
      )}
    >
      <div className="relative size-14 shrink-0 overflow-hidden rounded-full border border-border/60 bg-muted/40">
        {account.avatar_url ? (
          <img
            src={account.avatar_url}
            alt=""
            className="size-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="flex size-full items-center justify-center font-metric text-xl text-muted-foreground">
            {initial}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {label}
          </p>
          {account.status ? <StatusBadge status={account.status} /> : null}
          {account.login_required ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-red-700 dark:text-red-400">
              Login required
            </span>
          ) : null}
        </div>

        <div className="min-w-0">
          <p className="truncate font-medium leading-tight text-foreground">{name}</p>
          {handle ? (
            <p className="truncate font-mono text-xs text-muted-foreground">{handle}</p>
          ) : null}
        </div>

        {account.description ? (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {account.description}
          </p>
        ) : null}

        {account.profile_url ? (
          <a
            href={account.profile_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex font-mono text-[10px] uppercase tracking-[0.1em] text-primary underline-offset-2 hover:underline"
          >
            Open profile
          </a>
        ) : null}
      </div>
    </article>
  )
}

export function SeaLanesGrid({
  niches,
  collector,
}: {
  niches: NicheMappingRow[]
  collector?: PlatformAccountCard | null
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-1 xl:grid-cols-1">
      {niches.map((niche) => (
        <section
          key={niche.id}
          className="desk-panel space-y-3 rounded-md border border-border/80 p-4"
          data-tutorial="sea-lane"
        >
          <header className="flex flex-wrap items-end justify-between gap-2 border-b border-border/60 pb-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Sea lane
              </p>
              <h2 className="font-display text-2xl tracking-wide text-foreground">{niche.name}</h2>
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">slug · {niche.slug}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                Niche
              </span>
              <StatusBadge status={niche.is_active ? 'active' : 'paused'} />
            </div>
          </header>

          <div className="grid gap-3 md:grid-cols-2">
            <PlatformCard platform="youtube" account={niche.youtube} />
            <PlatformCard platform="instagram" account={niche.instagram} />
          </div>
        </section>
      ))}
      {collector ? (
        <section className="desk-panel space-y-3 rounded-md border border-border/80 p-4">
          <header className="flex flex-wrap items-end justify-between gap-2 border-b border-border/60 pb-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Sea lane
              </p>
              <h2 className="font-display text-2xl tracking-wide text-foreground">Collector</h2>
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">slug · collector</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                Inbox
              </span>
              <StatusBadge status={collector.login_required ? 'login_required' : 'active'} />
            </div>
          </header>
          <div className="grid gap-3 md:grid-cols-2">
            <PlatformCard platform="instagram" account={collector} />
          </div>
        </section>
      ) : null}
    </div>
  )
}
