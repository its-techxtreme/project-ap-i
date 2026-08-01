'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  AlertTriangle,
  BookOpen,
  Briefcase,
  LayoutDashboard,
  Map,
  Settings,
  Users,
} from 'lucide-react'

import { emitTutorialAction, type TutorialAction } from '@/lib/demo/tutorial-bus'
import { cn } from '@/lib/utils'

const items: {
  href: string
  label: string
  icon: typeof LayoutDashboard
  tutorial?: string
  action?: TutorialAction
}[] = [
  { href: '/admin', label: 'Nest', icon: LayoutDashboard, tutorial: 'nav-overview' },
  {
    href: '/admin/jobs',
    label: 'Log',
    icon: Briefcase,
    tutorial: 'nav-jobs',
    action: 'visit-jobs',
  },
  {
    href: '/admin/failed',
    label: 'Lost',
    icon: AlertTriangle,
    tutorial: 'nav-failed',
    action: 'visit-failed',
  },
  {
    href: '/admin/accounts',
    label: 'Crew',
    icon: Users,
    tutorial: 'nav-accounts',
    action: 'visit-accounts',
  },
  {
    href: '/admin/niches',
    label: 'Lanes',
    icon: Map,
    tutorial: 'nav-niches',
    action: 'visit-niches',
  },
  {
    href: '/admin/logs',
    label: 'Book',
    icon: BookOpen,
    tutorial: 'nav-logs',
    action: 'visit-logs',
  },
  { href: '/admin/settings', label: 'Charts', icon: Settings, tutorial: 'nav-settings' },
]

export function MobileNav() {
  const pathname = usePathname()

  return (
    <nav
      className="desk-chrome sticky top-14 z-30 flex gap-1 overflow-x-auto border-b border-border/70 px-2 py-2 md:hidden"
      aria-label="Admin sections"
    >
      {items.map((item) => {
        const active =
          pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href))
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
              'inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors',
              active
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
