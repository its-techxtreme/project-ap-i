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
    <Button variant="outline" size="sm" onClick={handleLogout} disabled={pending}>
      {pending ? 'Logging out…' : 'Log out'}
    </Button>
  )
}
