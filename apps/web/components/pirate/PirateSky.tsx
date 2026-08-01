import Image from 'next/image'

import { cn } from '@/lib/utils'

/** Full-bleed day/night pirate sky for public, login, and admin shells. */
export function PirateSky({ className }: { className?: string }) {
  return (
    <div className={cn('pirate-sky', className)} aria-hidden>
      <div className="pirate-sky__image pirate-sky__day sky-pan" />
      <div className="pirate-sky__image pirate-sky__night sky-pan" />
      <div className="pirate-sky__sun" />
      <div className="pirate-sky__wave wave-shimmer" />
      <div className="pirate-sky__wash" />
      {/* Decorative stars for night — CSS dots */}
      <div className="absolute inset-0 opacity-0 dark:opacity-100">
        <span className="sparkle absolute left-[18%] top-[22%] size-1 rounded-full bg-white/80" />
        <span
          className="sparkle absolute left-[42%] top-[14%] size-1.5 rounded-full bg-white/70"
          style={{ animationDelay: '0.6s' }}
        />
        <span
          className="sparkle absolute left-[68%] top-[20%] size-1 rounded-full bg-white/75"
          style={{ animationDelay: '1.1s' }}
        />
        <span
          className="sparkle absolute left-[78%] top-[32%] size-1 rounded-full bg-white/60"
          style={{ animationDelay: '1.7s' }}
        />
        <span
          className="sparkle absolute left-[28%] top-[36%] size-1 rounded-full bg-white/70"
          style={{ animationDelay: '0.3s' }}
        />
      </div>
    </div>
  )
}

export function CompassMark({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden
      className={cn('size-5 text-primary', className)}
    >
      <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="2.5" opacity="0.35" />
      <circle cx="32" cy="32" r="22" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M32 12v8M32 44v8M12 32h8M44 32h8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M32 20 L38 32 L32 44 L26 32 Z" fill="currentColor" opacity="0.85" />
      <circle cx="32" cy="32" r="3.5" fill="currentColor" />
    </svg>
  )
}

export function ShipImage({ className }: { className?: string }) {
  return (
    <Image
      src="/pirate/ship-sail.png"
      alt=""
      width={320}
      height={180}
      className={cn('h-auto w-full max-w-[280px] object-contain drop-shadow-lg', className)}
      priority={false}
    />
  )
}
