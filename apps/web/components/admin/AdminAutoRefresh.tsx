'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

type AdminAutoRefreshProps = {
  intervalMs?: number
  paused?: boolean
}

export function AdminAutoRefresh({ intervalMs = 45_000, paused = false }: AdminAutoRefreshProps) {
  const router = useRouter()

  useEffect(() => {
    if (paused) return

    const timer = setInterval(() => {
      router.refresh()
    }, intervalMs)

    return () => clearInterval(timer)
  }, [intervalMs, paused, router])

  return null
}
