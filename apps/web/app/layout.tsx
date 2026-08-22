import type { Metadata } from 'next'
import { Chakra_Petch, Pirata_One, Source_Sans_3 } from 'next/font/google'

import './globals.css'

const pirata = Pirata_One({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})

/** Pirata's 0 looks like an 8, so metrics use Chakra instead. */
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
  description: 'Paste a reel, pick a lane, we handle the rest.',
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
