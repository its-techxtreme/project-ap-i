'use client'

import Link from 'next/link'
import { FilePlus2 } from 'lucide-react'

import { LogoutButton } from '@/components/app/LogoutButton'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

function envLabel(): string {
  const vercel = process.env.NEXT_PUBLIC_VERCEL_ENV
  if (vercel === 'production') return 'production'
  if (vercel === 'preview') return 'preview'
  return process.env.NODE_ENV === 'production' ? 'production' : 'development'
}

export function Topbar({
  email,
  role,
}: {
  email?: string | null
  role?: 'admin' | 'demo'
}) {
  const env = envLabel()
  const label = email

  return (
    <header className="bg-chrome flex h-14 items-center justify-between border-b border-border/80 px-4 backdrop-blur-md md:px-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin"
          className="font-display text-lg font-semibold tracking-tight transition-colors duration-200 hover:text-primary"
        >
          Project AP-I
        </Link>
        <Badge
          variant="outline"
          className="hidden border-primary/25 bg-primary/10 font-normal capitalize text-primary sm:inline-flex"
        >
          {env}
        </Badge>
        {role === 'demo' ? (
          <Badge
            variant="outline"
            className="border-amber-500/30 bg-amber-500/10 font-normal text-amber-800 dark:text-amber-300"
          >
            Demo
          </Badge>
        ) : null}
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <Button
          asChild
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 border-border/70 bg-background/40 text-xs hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
        >
          <Link href="/" target="_blank" rel="noreferrer">
            <FilePlus2 className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">Submissions</span>
          </Link>
        </Button>
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
