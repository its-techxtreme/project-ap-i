import type { Metadata } from 'next'
import { Public_Sans, Syne } from 'next/font/google'

import './globals.css'

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})

const publicSans = Public_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Project AP-I',
  description: 'Short-form content intake, processing, and publishing',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${syne.variable} ${publicSans.variable} font-sans`}>{children}</body>
    </html>
  )
}
