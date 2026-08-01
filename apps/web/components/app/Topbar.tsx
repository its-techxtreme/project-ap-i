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
    <header className="desk-chrome grid h-14 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-border/70 px-4 backdrop-blur-md md:px-6">
      <div className="flex min-w-0 items-center gap-3 justify-self-start">
        <Link
          href="/admin"
          className="font-display text-lg font-semibold tracking-tight transition-colors duration-200 hover:text-primary"
        >
          Project AP-I
        </Link>
        <span className="hidden font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground lg:inline">
          Captain&apos;s Deck
        </span>
        <Badge
          variant="outline"
          className="hidden border-primary/30 bg-primary/10 font-mono text-[10px] uppercase tracking-[0.12em] text-primary sm:inline-flex"
        >
          {env}
        </Badge>
        {role === 'demo' ? (
          <button
            type="button"
            onClick={replayVoyage}
            title="Replay crew briefing"
            className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-amber-800 transition-colors hover:bg-amber-500/20 dark:text-amber-300"
          >
            Demo · replay tour
          </button>
        ) : null}
      </div>

      <div className="justify-self-center px-1">
        <RemoteLaptopSignal />
      </div>

      <div className="flex items-center justify-end gap-2 justify-self-end sm:gap-3">
        <Button
          asChild
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 border-border/70 bg-background/40 font-mono text-[11px] uppercase tracking-[0.08em] hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
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
          <span className="hidden max-w-[200px] truncate font-mono text-xs text-muted-foreground sm:inline">
            {label}
          </span>
        ) : null}
        <LogoutButton />
      </div>
    </header>
  )
}
