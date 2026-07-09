'use client'

import Link from 'next/link'

import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { cn } from '@/lib/utils'

export function PublicHeader({ className }: { className?: string }) {
  return (
    <header
      className={cn(
        'flex h-16 items-center justify-between px-4 md:px-8',
        className,
      )}
    >
      <Link
        href="/"
        className="font-display text-xl font-semibold tracking-tight text-foreground transition-colors duration-200 hover:text-primary md:text-2xl"
      >
        Project AP-I
      </Link>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <Link
          href="/login"
          className="cursor-pointer rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
        >
          Admin
        </Link>
      </div>
    </header>
  )
}
