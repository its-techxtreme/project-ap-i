import Image from 'next/image'

import { cn } from '@/lib/utils'

/** Full-bleed day/night pirate sky for public, login, and admin shells. */
export function PirateSky({ className }: { className?: string }) {
  return (
    <div className={cn('psk', className)} aria-hidden>
      <div className="psk-im psk-d" />
      <div className="psk-im psk-n" />
      <div className="psk-sun" />
      <div className="psk-wv" />
      <div className="psk-wsh" />
      <div className="stars">
        <span className="st st1 sparkle" />
        <span className="st st2 sparkle" />
        <span className="st st3 sparkle" />
        <span className="st st4 sparkle" />
        <span className="st st5 sparkle" />
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
