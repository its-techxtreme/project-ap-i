'use client'

import Link from 'next/link'

import { CompassMark } from '@/components/pirate/PirateSky'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { cn } from '@/lib/utils'

export function PublicHeader({ className }: { className?: string }) {
  return (
    <header className={cn('ph', className)}>
      <Link href="/" className="flex items-center gap-2.5 hover:text-primary">
        <span className="mark p-1.5">
          <CompassMark className="size-full" />
        </span>
        <span className="font-display text-2xl tracking-wide md:text-3xl">Project AP-I</span>
      </Link>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <Link href="/login" className="ph-go">
          Captain&apos;s Deck
        </Link>
      </div>
    </header>
  )
}
