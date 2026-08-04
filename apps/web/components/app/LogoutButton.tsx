'use client'

import { useTransition } from 'react'

import { adminLogout } from '@/app/actions/adminLogin'
import { Button } from '@/components/ui/button'

export function LogoutButton() {
  const [pending, startTransition] = useTransition()

  function handleLogout() {
    startTransition(async () => {
      await adminLogout()
    })
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleLogout}
      disabled={pending}
      className="h-8 shrink-0 px-2 font-mono text-[11px] uppercase tracking-[0.06em] sm:px-3"
      aria-label={pending ? 'Logging out' : 'Log out'}
    >
      {pending ? (
        '…'
      ) : (
        <>
          <span className="sm:hidden">Out</span>
          <span className="hidden sm:inline">Log out</span>
        </>
      )}
    </Button>
  )
}
