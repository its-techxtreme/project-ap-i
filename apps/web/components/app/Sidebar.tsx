'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Ship } from 'lucide-react'

import { ADMIN_NAV_ITEMS, isAdminNavActive } from '@/lib/admin/navItems'
import { emitTutorialAction } from '@/lib/demo/tutorial-bus'
import { cn } from '@/lib/utils'

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="desk-rail hidden w-[15.5rem] shrink-0 border-r border-border/70 md:flex md:flex-col">
      <div className="flex items-center gap-2.5 border-b border-border/60 px-4 py-4">
        <span className="flex size-7 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary">
          <Ship className="size-3.5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="font-display text-base tracking-wide">Captain&apos;s Deck</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Project AP-I
          </p>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-2.5" aria-label="Admin navigation">
        {ADMIN_NAV_ITEMS.map((item) => {
          const isActive = isAdminNavActive(pathname, item.href)
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              data-tutorial={item.tutorial}
              onClick={() => {
                if (item.action) emitTutorialAction(item.action)
              }}
              className={cn(
                'group relative flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200',
                isActive
                  ? 'bg-primary/12 text-primary'
                  : 'text-muted-foreground hover:bg-muted/45 hover:text-foreground',
              )}
            >
              {isActive ? (
                <span
                  className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary"
                  aria-hidden
                />
              ) : null}
              <Icon
                className={cn(
                  'size-4 shrink-0 transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                )}
                aria-hidden
              />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
