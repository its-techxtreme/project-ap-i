import { Topbar } from '@/components/app/Topbar'
import { Sidebar } from '@/components/app/Sidebar'

export function AppShell({
  email,
  variant,
  children,
}: {
  email?: string | null
  variant: 'submitter' | 'admin'
  children: React.ReactNode
}) {
  if (variant === 'submitter') {
    return (
      <div className="flex min-h-screen flex-col">
        <Topbar email={email} />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Topbar email={email} />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
