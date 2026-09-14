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
      className={cn('pn', className)}
    >
      {title || eyebrow || action ? (
        <header className="pn-hd">
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
