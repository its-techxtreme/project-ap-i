import type { ReactNode } from 'react'

export function DeskPageHeader({
  kicker = "Captain's Deck",
  title,
  description,
  meta,
  actions,
}: {
  kicker?: string
  title: string
  description?: string
  meta?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border/60 pb-4">
      <div className="min-w-0 space-y-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">{kicker}</p>
        <h1 className="font-display text-3xl tracking-wide">{title}</h1>
        {description ? <p className="max-w-xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {meta}
        {actions}
      </div>
    </div>
  )
}
