'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type NicheOption = { id: string; name: string }

const STATUS_OPTIONS = [
  'queued',
  'processing',
  'completed',
  'failed',
  'needs_manual_review',
  'uploading',
  'awaiting_verification',
]

const UPLOAD_STATUS_OPTIONS = [
  'pending',
  'uploading',
  'uploaded',
  'verified',
  'failed',
  'login_required',
]

const selectClassName = cn(
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
)

export function JobFilters({ niches }: { niches: NicheOption[] }) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  const selectedStatuses = searchParams.get('status')?.split(',').filter(Boolean) ?? []

  function updateParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '') {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    }
    params.delete('page')
    router.push(`${pathname}?${params.toString()}`)
  }

  function toggleStatus(status: string) {
    const next = selectedStatuses.includes(status)
      ? selectedStatuses.filter((s) => s !== status)
      : [...selectedStatuses, status]
    updateParams({ status: next.length ? next.join(',') : null })
  }

  function clearFilters() {
    router.push(pathname)
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="nicheId">Niche</Label>
          <select
            id="nicheId"
            className={selectClassName}
            value={searchParams.get('nicheId') ?? ''}
            onChange={(e) => updateParams({ nicheId: e.target.value || null })}
          >
            <option value="">All niches</option>
            {niches.map((niche) => (
              <option key={niche.id} value={niche.id}>
                {niche.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="sourcePlatform">Source platform</Label>
          <select
            id="sourcePlatform"
            className={selectClassName}
            value={searchParams.get('sourcePlatform') ?? ''}
            onChange={(e) => updateParams({ sourcePlatform: e.target.value || null })}
          >
            <option value="">All platforms</option>
            <option value="youtube">YouTube</option>
            <option value="instagram">Instagram</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="youtubeUploadStatus">YouTube upload status</Label>
          <select
            id="youtubeUploadStatus"
            className={selectClassName}
            value={searchParams.get('youtubeUploadStatus') ?? ''}
            onChange={(e) => updateParams({ youtubeUploadStatus: e.target.value || null })}
          >
            <option value="">Any</option>
            {UPLOAD_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="instagramUploadStatus">Instagram upload status</Label>
          <select
            id="instagramUploadStatus"
            className={selectClassName}
            value={searchParams.get('instagramUploadStatus') ?? ''}
            onChange={(e) => updateParams({ instagramUploadStatus: e.target.value || null })}
          >
            <option value="">Any</option>
            {UPLOAD_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="dateFrom">Created from</Label>
          <Input
            id="dateFrom"
            type="date"
            value={searchParams.get('dateFrom') ?? ''}
            onChange={(e) => updateParams({ dateFrom: e.target.value || null })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="dateTo">Created to</Label>
          <Input
            id="dateTo"
            type="date"
            value={searchParams.get('dateTo') ?? ''}
            onChange={(e) => updateParams({ dateTo: e.target.value || null })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Status</Label>
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((status) => {
            const active = selectedStatuses.includes(status)
            return (
              <Button
                key={status}
                type="button"
                size="sm"
                variant={active ? 'default' : 'outline'}
                onClick={() => toggleStatus(status)}
              >
                {status.replace(/_/g, ' ')}
              </Button>
            )
          })}
        </div>
      </div>

      <Button type="button" variant="ghost" size="sm" onClick={clearFilters} asChild>
        <Link href={pathname}>Clear filters</Link>
      </Button>
    </div>
  )
}
