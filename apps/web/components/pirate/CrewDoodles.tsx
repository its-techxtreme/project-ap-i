import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

const ASSET = {
  stretch: '/pirate/crew-stretch.svg?v=4',
  blades: '/pirate/crew-blades.svg?v=4',
  navigator: '/pirate/crew-navigator.svg?v=4',
  cook: '/pirate/crew-cook.svg?v=4',
  doctor: '/pirate/crew-bird.svg?v=4',
} as const

function Mate({
  src,
  className,
  delay = '0s',
}: {
  src: string
  className?: string
  delay?: string
}) {
  return (
    <img
      src={src}
      alt=""
      width={140}
      height={160}
      className={cn(
        'crew-doodle pointer-events-none absolute z-[6] drop-shadow-[0_6px_14px_rgba(15,23,42,0.4)]',
        className,
      )}
      style={{ animationDelay: delay }}
      aria-hidden
    />
  )
}

type CrewDoodlesProps = {
  hero: ReactNode
  form: ReactNode
  className?: string
}

/**
 * Anchored crew frame:
 * - stretch + blades flank the title row
 * - doctor sits on the form’s top-right corner
 * - navigator + cook guard the form’s lower sides
 */
export function CrewDoodles({ hero, form, className }: CrewDoodlesProps) {
  return (
    <div className={cn('relative mx-auto w-full max-w-xl', className)}>
      <div className="relative mb-8">
        <Mate
          src={ASSET.stretch}
          delay="0s"
          className="left-0 top-1/2 w-[4.5rem] -translate-y-1/2 sm:-left-6 sm:w-24 md:-left-28 md:w-32 lg:-left-36 lg:w-36"
        />
        <Mate
          src={ASSET.blades}
          delay="0.3s"
          className="right-0 top-1/2 w-[4.5rem] -translate-y-1/2 sm:-right-6 sm:w-24 md:-right-28 md:w-32 lg:-right-36 lg:w-36"
        />
        {hero}
      </div>

      <div className="relative">
        <Mate
          src={ASSET.doctor}
          delay="0.55s"
          className="right-3 top-0 z-[7] w-12 -translate-y-1/2 sm:right-5 sm:w-14 md:right-4 md:w-16"
        />
        <Mate
          src={ASSET.navigator}
          delay="0.15s"
          className="bottom-10 left-0 w-[4.25rem] sm:-left-8 sm:w-20 md:-left-28 md:w-28 lg:-left-36"
        />
        <Mate
          src={ASSET.cook}
          delay="0.4s"
          className="bottom-10 right-0 w-[4.25rem] sm:-right-8 sm:w-20 md:-right-28 md:w-28 lg:-right-36"
        />
        {form}
      </div>
    </div>
  )
}
