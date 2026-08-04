import type { Metadata } from 'next'
import { Chakra_Petch, Pirata_One, Source_Sans_3 } from 'next/font/google'

import './globals.css'

const pirata = Pirata_One({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})

/** Geometric condensed numerals — open circular 0s (Pirata zeros read like 8s). */
const chakraPetch = Chakra_Petch({
  weight: ['500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-metric',
  display: 'swap',
})

const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Project AP-I',
  description: 'Short-form content intake, processing, and publishing — set sail with the crew',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${pirata.variable} ${chakraPetch.variable} ${sourceSans.variable} font-sans`}
      >
        {children}
      </body>
    </html>
  )
}
