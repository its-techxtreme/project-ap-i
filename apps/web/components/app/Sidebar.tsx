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
    <aside className="rail">
      <div className="rail-hd">
        <span className="mark">
          <Ship className="size-3.5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="font-display text-base tracking-wide">Captain&apos;s Deck</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Project AP-I
          </p>
        </div>
      </div>
      <nav className="rail-nav" aria-label="Admin navigation">
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
              className={cn('nv', isActive && 'nv-on')}
            >
              {isActive ? <span className="pip" aria-hidden /> : null}
              <Icon
                className={cn(
                  'size-4 shrink-0',
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
