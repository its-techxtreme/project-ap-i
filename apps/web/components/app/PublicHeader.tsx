'use client'

import Link from 'next/link'

import { CompassMark } from '@/components/pirate/PirateSky'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { cn } from '@/lib/utils'

export function PublicHeader({ className }: { className?: string }) {
  return (
    <header
      className={cn(
        'relative z-10 flex h-16 items-center justify-between border-b border-border/40 px-4 backdrop-blur-md md:px-8',
        className,
      )}
    >
      <Link href="/" className="flex items-center gap-2.5 transition-colors hover:text-primary">
        <span className="flex size-8 items-center justify-center rounded-md border border-primary/30 bg-primary/10 p-1.5 text-primary">
          <CompassMark className="size-full" />
        </span>
        <span className="font-display text-2xl tracking-wide md:text-3xl">Project AP-I</span>
      </Link>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <Link
          href="/login"
          className="cursor-pointer rounded-md border border-border/70 bg-card/55 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground transition-colors duration-200 hover:border-primary/40 hover:text-primary"
        >
          Captain&apos;s Deck
        </Link>
      </div>
    </header>
  )
}
