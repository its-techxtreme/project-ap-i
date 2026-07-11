import Script from 'next/script'

import { Sidebar } from '@/components/app/Sidebar'
import { Topbar } from '@/components/app/Topbar'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { themeInitScript } from '@/lib/theme/themeInit'

export function AppShell({
  email,
  variant,
  children,
}: {
  email?: string | null
  variant: 'submitter' | 'admin'
  children: React.ReactNode
}) {
  if (variant === 'admin') {
    return (
      <ThemeProvider surface="admin">
        <Script id="theme-init-admin" strategy="beforeInteractive">
          {themeInitScript('admin')}
        </Script>
        <div className="bg-atmosphere flex min-h-screen flex-col">
          <Topbar email={email} />
          <div className="flex flex-1">
            <Sidebar />
            <main className="flex-1 p-4 md:p-6 lg:p-7">{children}</main>
          </div>
        </div>
      </ThemeProvider>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Topbar email={email} />
      <main className="flex-1 p-4 md:p-6">{children}</main>
    </div>
  )
}
