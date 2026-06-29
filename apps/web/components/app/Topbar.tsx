import Link from 'next/link'

import { LogoutButton } from '@/components/app/LogoutButton'

export function Topbar({ email }: { email?: string | null }) {
  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-4 md:px-6">
      <Link href="/" className="text-lg font-semibold tracking-tight">
        Project AP-I
      </Link>
      <div className="flex items-center gap-4">
        {email ? (
          <span className="hidden text-sm text-muted-foreground sm:inline">{email}</span>
        ) : null}
        <LogoutButton />
      </div>
    </header>
  )
}
