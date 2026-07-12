import Script from 'next/script'

import { AdminCapabilitiesProvider } from '@/components/admin/AdminCapabilities'
import { Sidebar } from '@/components/app/Sidebar'
import { Topbar } from '@/components/app/Topbar'
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
          <div className="bg-atmosphere flex min-h-screen flex-col">
            <Topbar email={email} role={role} />
            <div className="flex flex-1">
              <Sidebar />
              <main className="flex-1 p-4 md:p-6 lg:p-7">
                {!canWrite ? (
                  <p className="notice-warn mb-4 rounded-md border px-3 py-2 text-sm">
                    Demo mode — you can browse everything, but retry / delete / account actions are
                    locked.
                  </p>
                ) : null}
                {children}
              </main>
            </div>
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
