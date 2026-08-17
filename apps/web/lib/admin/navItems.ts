import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  BookOpen,
  Briefcase,
  Inbox,
  LayoutDashboard,
  Map,
  Settings,
  Users,
} from 'lucide-react'

import type { TutorialAction } from '@/lib/demo/tutorial-bus'

export type AdminNavItem = {
  href: string
  /** Full label for desktop rail */
  label: string
  /** Short label for mobile grid */
  shortLabel: string
  icon: LucideIcon
  tutorial?: string
  action?: TutorialAction
}

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    href: '/admin',
    label: "Crow's nest",
    shortLabel: 'Nest',
    icon: LayoutDashboard,
    tutorial: 'nav-overview',
  },
  {
    href: '/admin/jobs',
    label: "Ship's log",
    shortLabel: 'Log',
    icon: Briefcase,
    tutorial: 'nav-jobs',
    action: 'visit-jobs',
  },
  {
    href: '/admin/failed',
    label: 'Lost cargo',
    shortLabel: 'Lost',
    icon: AlertTriangle,
    tutorial: 'nav-failed',
    action: 'visit-failed',
  },
  {
    href: '/admin/collector',
    label: 'Unsorted cargo',
    shortLabel: 'Inbox',
    icon: Inbox,
    tutorial: 'nav-collector',
  },
  {
    href: '/admin/accounts',
    label: 'Crew',
    shortLabel: 'Crew',
    icon: Users,
    tutorial: 'nav-accounts',
    action: 'visit-accounts',
  },
  {
    href: '/admin/niches',
    label: 'Sea lanes',
    shortLabel: 'Lanes',
    icon: Map,
    tutorial: 'nav-niches',
    action: 'visit-niches',
  },
  {
    href: '/admin/logs',
    label: 'Logbook',
    shortLabel: 'Book',
    icon: BookOpen,
    tutorial: 'nav-logs',
    action: 'visit-logs',
  },
  {
    href: '/admin/settings',
    label: 'Chart room',
    shortLabel: 'Charts',
    icon: Settings,
    tutorial: 'nav-settings',
  },
]

export function isAdminNavActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== '/admin' && pathname.startsWith(href))
}
