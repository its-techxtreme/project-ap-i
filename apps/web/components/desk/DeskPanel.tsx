import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export function DeskPanel({
  children,
  className,
  title,
  eyebrow,
  action,
}: {
  children: ReactNode
  className?: string
  title?: string
  eyebrow?: string
  action?: ReactNode
}) {
  return (
    <section
      className={cn(
        'desk-panel overflow-hidden rounded-md border border-border/80',
        className,
      )}
    >
      {title || eyebrow || action ? (
        <header className="flex items-center justify-between gap-2 border-b border-border/60 px-3.5 py-2.5">
          <div>
            {eyebrow ? (
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {eyebrow}
              </p>
            ) : null}
            {title ? (
              <h2 className="font-display text-lg tracking-wide">{title}</h2>
            ) : null}
          </div>
          {action}
        </header>
      ) : null}
      {children}
    </section>
  )
}
