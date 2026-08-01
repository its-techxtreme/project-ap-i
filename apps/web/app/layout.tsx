import type { Metadata } from 'next'
import { Pirata_One, Source_Sans_3 } from 'next/font/google'

import './globals.css'

const pirata = Pirata_One({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-display',
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
      <body className={`${pirata.variable} ${sourceSans.variable} font-sans`}>{children}</body>
    </html>
  )
}
