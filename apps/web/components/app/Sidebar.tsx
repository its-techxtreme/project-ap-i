'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  AlertTriangle,
  Briefcase,
  FileText,
  LayoutDashboard,
  Settings,
  Tags,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

const navItems: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/jobs', label: 'Jobs', icon: Briefcase },
  { href: '/admin/failed', label: 'Failed Review', icon: AlertTriangle },
  { href: '/admin/accounts', label: 'Accounts', icon: Users },
  { href: '/admin/niches', label: 'Niches', icon: Tags },
  { href: '/admin/logs', label: 'Logs', icon: FileText },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="bg-chrome hidden w-56 shrink-0 border-r border-border/80 md:block">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3.5">
        <span className="h-5 w-1 rounded-full bg-primary" aria-hidden />
        <span className="font-display text-sm font-semibold tracking-tight">Project AP-I</span>
      </div>
      <nav className="flex flex-col gap-0.5 p-3" aria-label="Admin navigation">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/admin' && pathname.startsWith(item.href))
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group relative flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200',
                isActive
                  ? 'bg-primary/12 text-primary'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
              )}
            >
              {isActive ? (
                <span
                  className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-primary"
                  aria-hidden
                />
              ) : null}
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
