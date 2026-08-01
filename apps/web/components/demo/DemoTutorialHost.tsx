'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import { DemoTutorialOverlay } from '@/components/demo/DemoTutorialOverlay'
import { DEMO_TUTORIAL_FORCE_KEY } from '@/lib/demo/tutorial-steps'

function DemoTutorialInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const booted = useRef(false)
  const [boot, setBoot] = useState<{ ready: boolean; force: boolean }>({
    ready: false,
    force: false,
  })

  useEffect(() => {
    if (booted.current) return
    booted.current = true

    const voyage = searchParams.get('voyage') === '1'
    let force = voyage
    try {
      if (window.sessionStorage.getItem(DEMO_TUTORIAL_FORCE_KEY) === '1') {
        force = true
        window.sessionStorage.removeItem(DEMO_TUTORIAL_FORCE_KEY)
      }
    } catch {
      /* ignore */
    }

    if (voyage) {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('voyage')
      const next = params.toString()
      router.replace(next ? `/admin?${next}` : '/admin')
    }

    setBoot({ ready: true, force })
  }, [router, searchParams])

  if (!boot.ready) return null
  return <DemoTutorialOverlay forceStart={boot.force} />
}

/** Mounts the interactive crew briefing for demo sessions only. */
export function DemoTutorialHost() {
  return (
    <Suspense fallback={null}>
      <DemoTutorialInner />
    </Suspense>
  )
}
