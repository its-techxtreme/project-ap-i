'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { setCollectorArmed } from '@/app/actions/setCollectorArmed'
import { useAdminCapabilities } from '@/components/admin/AdminCapabilities'
import { Button } from '@/components/ui/button'

export function CollectorArmedToggle({
  armed,
  laptopEnabled,
  runsToday,
  maxRuns,
  workerDay,
}: {
  armed: boolean
  laptopEnabled: boolean
  runsToday: number
  maxRuns: number
  workerDay?: string | null
}) {
  const router = useRouter()
  const { canWrite } = useAdminCapabilities()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function setArmed(next: boolean) {
    setBusy(true)
    setError(null)
    try {
      const result = await setCollectorArmed(next)
      if (!result.success) {
        setError(result.error)
        return
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the collector switch.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="desk-panel space-y-3 rounded-md border border-border/80 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Instagram scraper</p>
          <p className="text-sm text-foreground">
            {laptopEnabled
              ? armed
                ? 'On. Runs when the worker starts and again every 3 hours, at most twice today.'
                : 'Off. Worker stays up; Chrome collector will not start.'
              : 'Laptop COLLECTOR_ENABLED is false. Turn that on in .env, then use this switch.'}
          </p>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            Used {runsToday}/{maxRuns} today{workerDay ? ` (${workerDay})` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={armed ? 'default' : 'outline'}
            disabled={!canWrite || busy || !laptopEnabled}
            onClick={() => void setArmed(true)}
          >
            On
          </Button>
          <Button
            type="button"
            size="sm"
            variant={!armed ? 'default' : 'outline'}
            disabled={!canWrite || busy}
            onClick={() => void setArmed(false)}
          >
            Off
          </Button>
        </div>
      </div>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </div>
  )
}
