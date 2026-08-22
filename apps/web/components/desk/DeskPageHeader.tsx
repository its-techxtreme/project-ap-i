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
    <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2 border-b border-border/50 pb-[17px]">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">{kicker}</p>
        <h1 className="font-display text-2xl tracking-wide sm:text-[1.85rem]">{title}</h1>
        {description ? (
          <p className="max-w-lg text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
        {meta}
        {actions}
      </div>
    </div>
  )
}
