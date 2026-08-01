'use client'

import { ShipImage } from '@/components/pirate/PirateSky'
import { cn } from '@/lib/utils'

type ShipSuccessProps = {
  nicheLabel: string
  platformLabel: string
  publicJobCode: string | null
  className?: string
}

/**
 * Post-submit celebration: parchment message + ship sailing across the dock.
 */
export function ShipSuccess({
  nicheLabel,
  platformLabel,
  publicJobCode,
  className,
}: ShipSuccessProps) {
  return (
    <div
      className={cn(
        'animate-success parchment-panel relative overflow-hidden rounded-xl p-5 md:p-6',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="relative z-10 space-y-3 text-center md:text-left">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary">
          Cargo secured
        </p>
        <h2 className="font-display text-3xl leading-tight tracking-wide text-foreground md:text-4xl">
          Ahem! The content has been loaded on the ship
        </h2>
        <p className="text-base text-muted-foreground md:text-lg">
          The ship is waiting on the dock, ready to sail!!
        </p>
        <div className="space-y-1.5 pt-2 text-sm text-muted-foreground">
          {publicJobCode ? (
            <p>
              Voyage ticket:{' '}
              <span className="font-medium text-foreground">{publicJobCode}</span>
            </p>
          ) : null}
          <p>
            Sea lane: <span className="font-medium text-foreground">{nicheLabel}</span>
          </p>
          <p>
            Source port:{' '}
            <span className="font-medium text-foreground">{platformLabel}</span>
          </p>
          <p>
            Status:{' '}
            <span className="font-medium text-primary">Queued at the dock — awaiting crew</span>
          </p>
        </div>
      </div>

      <div className="relative mt-8 h-28 overflow-hidden rounded-lg border border-border/60 bg-gradient-to-b from-sky-200/40 to-teal-700/25 dark:from-slate-800/50 dark:to-teal-950/40">
        <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-teal-800/40 to-transparent wave-shimmer" />
        <div className="absolute bottom-2 left-4 h-3 w-16 rounded-sm bg-amber-900/50 dark:bg-amber-950/60" />
        <div className="absolute bottom-2 left-24 h-2 w-10 rounded-sm bg-amber-800/40" />
        <img
          src="/pirate/crew-bird.svg"
          alt=""
          className="crew-doodle absolute right-6 top-2 w-10 drop-shadow"
          aria-hidden
        />
        <div className="ship-sail absolute bottom-1 left-0 flex w-full justify-start px-2">
          <ShipImage className="max-w-[200px] md:max-w-[240px]" />
        </div>
      </div>
    </div>
  )
}
