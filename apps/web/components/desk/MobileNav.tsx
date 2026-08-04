'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'

import { ADMIN_NAV_ITEMS, isAdminNavActive } from '@/lib/admin/navItems'
import { emitTutorialAction } from '@/lib/demo/tutorial-bus'
import { cn } from '@/lib/utils'

/**
 * Narrow-viewport admin navigation.
 * Fixed full-width sheet lists every destination — never clipped horizontal scroll.
 */
export function MobileNav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)

  const current =
    ADMIN_NAV_ITEMS.find((item) => isAdminNavActive(pathname, item.href)) ?? ADMIN_NAV_ITEMS[0]
  const CurrentIcon = current.icon

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    closeRef.current?.focus()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  return (
    <div className="desk-chrome border-b border-border/70 md:hidden">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <button
          type="button"
          className={cn(
            'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-2.5 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors',
            open
              ? 'border-primary/40 bg-primary/15 text-primary'
              : 'border-border/70 bg-background/50 text-foreground hover:border-primary/35 hover:bg-primary/10',
          )}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X className="size-3.5" aria-hidden /> : <Menu className="size-3.5" aria-hidden />}
          Deck menu
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            Now aboard
          </p>
          <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
            <CurrentIcon className="size-3.5 shrink-0 text-primary" aria-hidden />
            <span className="truncate">{current.label}</span>
          </p>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-[60] md:hidden" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-foreground/35 backdrop-blur-[1px]"
            aria-label="Close deck menu"
            onClick={() => setOpen(false)}
          />
          <div
            id={panelId}
            role="dialog"
            aria-modal="true"
            aria-label="Captain's Deck navigation"
            className="absolute inset-x-0 top-0 flex max-h-[min(100dvh,100%)] flex-col border-b border-border/70 bg-card shadow-xl"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2.5">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  All sea posts
                </p>
                <p className="truncate font-display text-lg tracking-wide">Captain&apos;s Deck</p>
              </div>
              <button
                ref={closeRef}
                type="button"
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-border/70 px-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-foreground hover:bg-muted/50"
                onClick={() => setOpen(false)}
              >
                <X className="size-3.5" aria-hidden />
                Close
              </button>
            </div>

            <nav
              aria-label="Admin sections"
              className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            >
              {ADMIN_NAV_ITEMS.map((item) => {
                const active = isAdminNavActive(pathname, item.href)
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    data-tutorial={item.tutorial}
                    onClick={() => {
                      if (item.action) emitTutorialAction(item.action)
                      setOpen(false)
                    }}
                    className={cn(
                      'flex min-h-11 w-full items-center gap-3 rounded-md border px-3 py-2.5 text-sm font-medium transition-colors',
                      active
                        ? 'border-primary/45 bg-primary/12 text-primary'
                        : 'border-border/60 bg-background/55 text-foreground hover:border-primary/30 hover:bg-primary/8',
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{item.label}</span>
                      <span className="block font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                        {item.shortLabel}
                      </span>
                    </span>
                  </Link>
                )
              })}
            </nav>
          </div>
        </div>
      ) : null}
    </div>
  )
}
