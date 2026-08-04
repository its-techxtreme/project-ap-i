'use client'

import Link from 'next/link'
import { FilePlus2 } from 'lucide-react'

import { LogoutButton } from '@/components/app/LogoutButton'
import { RemoteLaptopSignal } from '@/components/app/RemoteLaptopSignal'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { emitTutorialAction } from '@/lib/demo/tutorial-bus'
import {
  DEMO_TUTORIAL_FORCE_KEY,
  DEMO_TUTORIAL_STORAGE_KEY,
} from '@/lib/demo/tutorial-steps'

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

  function replayVoyage() {
    try {
      window.localStorage.removeItem(DEMO_TUTORIAL_STORAGE_KEY)
      window.sessionStorage.setItem(DEMO_TUTORIAL_FORCE_KEY, '1')
    } catch {
      /* ignore */
    }
    window.location.assign('/admin?voyage=1')
  }

  return (
    <header className="desk-chrome border-b border-border/70 backdrop-blur-md">
      {/* Primary row — never overlap brand / actions with the laptop signal */}
      <div className="flex h-12 items-center gap-2 px-3 sm:h-14 sm:gap-3 sm:px-4 md:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <Link
            href="/admin"
            className="shrink-0 font-display text-base font-semibold tracking-tight transition-colors duration-200 hover:text-primary sm:text-lg"
          >
            Project AP-I
          </Link>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground xl:inline">
            Captain&apos;s Deck
          </span>
          <Badge
            variant="outline"
            className="hidden border-primary/30 bg-primary/10 font-mono text-[10px] uppercase tracking-[0.12em] text-primary md:inline-flex"
          >
            {env}
          </Badge>
          {role === 'demo' ? (
            <button
              type="button"
              onClick={replayVoyage}
              title="Replay crew briefing"
              className="hidden rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-amber-800 transition-colors hover:bg-amber-500/20 sm:inline-flex dark:text-amber-300"
            >
              Demo · replay tour
            </button>
          ) : null}
        </div>

        {/* Center signal only when there is room; small screens use the second row */}
        <div className="hidden min-w-0 max-w-[min(42vw,22rem)] justify-center lg:flex">
          <RemoteLaptopSignal />
        </div>

        <div className="flex shrink-0 items-center justify-end gap-1.5 sm:gap-2 md:gap-3">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 border-border/70 bg-background/40 px-2 font-mono text-[11px] uppercase tracking-[0.08em] hover:border-primary/40 hover:bg-primary/10 hover:text-primary sm:px-3"
          >
            <Link
              href="/"
              target="_blank"
              rel="noreferrer"
              data-tutorial="cargo-bay"
              onClick={() => emitTutorialAction('open-cargo-bay')}
            >
              <FilePlus2 className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">Cargo bay</span>
            </Link>
          </Button>
          <ThemeToggle />
          {label ? (
            <span className="hidden max-w-[160px] truncate font-mono text-xs text-muted-foreground xl:inline">
              {label}
            </span>
          ) : null}
          <LogoutButton />
        </div>
      </div>

      {/* Narrow screens: laptop status (+ compact demo tour) on its own row */}
      <div className="flex items-center gap-2 border-t border-border/50 px-3 py-1.5 lg:hidden sm:px-4">
        <div className="min-w-0 flex-1">
          <RemoteLaptopSignal compact />
        </div>
        {role === 'demo' ? (
          <button
            type="button"
            onClick={replayVoyage}
            title="Replay crew briefing"
            className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-amber-800 transition-colors hover:bg-amber-500/20 sm:hidden dark:text-amber-300"
          >
            Tour
          </button>
        ) : null}
      </div>
    </header>
  )
}
