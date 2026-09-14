'use client'

import { ShipImage } from '@/components/pirate/PirateSky'
import { cn } from '@/lib/utils'

type ShipSuccessProps = {
  nicheLabel: string
  platformLabel: string
  publicJobCode: string | null
  className?: string
}

/** After submit. Note on parchment plus the ship crossing the dock. */
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

      <div className="dk">
        <div className="dk-wv wave-shimmer" />
        <div className="dk-pl" />
        <div className="dk-pl2" />
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
