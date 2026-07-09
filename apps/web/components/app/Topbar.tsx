'use client'

import Link from 'next/link'

import { LogoutButton } from '@/components/app/LogoutButton'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { Badge } from '@/components/ui/badge'

function envLabel(): string {
  const vercel = process.env.NEXT_PUBLIC_VERCEL_ENV
  if (vercel === 'production') return 'production'
  if (vercel === 'preview') return 'preview'
  return process.env.NODE_ENV === 'production' ? 'production' : 'development'
}

export function Topbar({ email }: { email?: string | null }) {
  const env = envLabel()
  const label = email

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card/80 px-4 backdrop-blur-sm md:px-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin"
          className="font-display text-lg font-semibold tracking-tight transition-colors duration-200 hover:text-primary"
        >
          Project AP-I
        </Link>
        <Badge
          variant="outline"
          className="hidden font-normal capitalize text-muted-foreground sm:inline-flex"
        >
          {env}
        </Badge>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <ThemeToggle />
        {label ? (
          <span className="hidden max-w-[200px] truncate text-sm text-muted-foreground sm:inline">
            {label}
          </span>
        ) : null}
        <LogoutButton />
      </div>
    </header>
  )
}
