import Script from 'next/script'

import { AdminCapabilitiesProvider } from '@/components/admin/AdminCapabilities'
import { Sidebar } from '@/components/app/Sidebar'
import { Topbar } from '@/components/app/Topbar'
import { DemoTutorialHost } from '@/components/demo/DemoTutorialHost'
import { MobileNav } from '@/components/desk/MobileNav'
import { PirateSky } from '@/components/pirate/PirateSky'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { themeInitScript } from '@/lib/theme/themeInit'

export function AppShell({
  email,
  variant,
  role = 'admin',
  children,
}: {
  email?: string | null
  variant: 'submitter' | 'admin'
  role?: 'admin' | 'demo'
  children: React.ReactNode
}) {
  if (variant === 'admin') {
    const canWrite = role === 'admin'
    return (
      <ThemeProvider surface="admin">
        <Script id="theme-init-admin" strategy="beforeInteractive">
          {themeInitScript('admin')}
        </Script>
        <AdminCapabilitiesProvider canWrite={canWrite} role={role}>
          <div className="desk-shell relative flex min-h-screen flex-col overflow-hidden">
            <PirateSky className="opacity-40 dark:opacity-55" />
            <div className="relative z-10 flex min-h-screen flex-col">
              <Topbar email={email} role={role} />
              <MobileNav />
              <div className="flex flex-1">
                <Sidebar />
                <main className="flex-1 p-4 md:p-6 lg:p-7">
                  {!canWrite ? (
                    <p
                      data-tutorial="demo-banner"
                      className="notice-warn mb-4 rounded-md border px-3 py-2 text-sm"
                    >
                      Demo watch — browse only. Write actions are locked ashore.
                    </p>
                  ) : null}
                  {children}
                </main>
              </div>
            </div>
            {role === 'demo' ? <DemoTutorialHost /> : null}
          </div>
        </AdminCapabilitiesProvider>
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
