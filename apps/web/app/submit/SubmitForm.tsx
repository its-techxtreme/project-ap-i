'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { detectPlatform, validateSourceUrl } from '@project-api/shared'

import { submitJobAction } from '@/app/actions/submitJob'
import { ErrorAlert } from '@/components/app/ErrorAlert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type NicheOption = {
  id: string
  name: string
  slug: string
}

const selectClassName = cn(
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
)

const PLATFORM_LABELS: Record<'youtube' | 'instagram', string> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
}

function getUrlErrorMessage(url: string): string | null {
  if (!url.trim()) return null

  const result = validateSourceUrl(url.trim())
  if (result.valid) return null

  if (
    result.code === 'UNSUPPORTED_DOMAIN' ||
    result.code === 'UNSUPPORTED_PROTOCOL' ||
    result.code === 'PRIVATE_IP' ||
    result.code === 'LOCALHOST'
  ) {
    return 'Only YouTube and Instagram links are supported.'
  }

  return 'Please paste a valid URL.'
}

export function SubmitForm({ niches }: { niches: NicheOption[] }) {
  const [sourceUrl, setSourceUrl] = useState('')
  const [sourcePlatform, setSourcePlatform] = useState<'youtube' | 'instagram' | ''>('')
  const [nicheId, setNicheId] = useState('')
  const [rightsConfirmed, setRightsConfirmed] = useState(false)
  const [urlError, setUrlError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{
    nicheLabel: string
    platformLabel: string
    publicJobCode: string | null
  } | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleUrlChange(value: string) {
    setSourceUrl(value)
    setFormError(null)
    setUrlError(getUrlErrorMessage(value))

    if (!value.trim()) {
      return
    }

    const result = validateSourceUrl(value.trim())
    if (result.valid) {
      const platform = detectPlatform(result.normalizedUrl)
      if (platform) {
        setSourcePlatform(platform)
      }
    }
  }

  const urlValid = sourceUrl.trim() !== '' && urlError === null
  const canSubmit =
    urlValid && sourcePlatform !== '' && nicheId !== '' && rightsConfirmed && !isPending && !success

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return

    setFormError(null)

    startTransition(async () => {
      const result = await submitJobAction({
        sourceUrl: sourceUrl.trim(),
        sourcePlatform: sourcePlatform as 'youtube' | 'instagram',
        nicheId,
        rightsConfirmed: true,
      })

      if (result.success) {
        setSuccess({
          nicheLabel: result.nicheLabel,
          platformLabel: PLATFORM_LABELS[sourcePlatform],
          publicJobCode: result.publicJobCode,
        })
        return
      }

      setFormError(result.error)
    })
  }

  if (niches.length === 0) {
    return (
      <ErrorAlert message="No active niche is configured. Contact admin." title="Unavailable" />
    )
  }

  if (success) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Submitted</CardTitle>
          <CardDescription>
            Submitted successfully. This job is now queued for processing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {success.publicJobCode ? <p>Job: {success.publicJobCode}</p> : null}
          <p>Niche: {success.nicheLabel}</p>
          <p>Platform detected: {success.platformLabel}</p>
          <p>Status: Queued for processing</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Submit Content</CardTitle>
        <CardDescription>Paste a client-approved reel or short link to queue processing.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {formError ? <ErrorAlert message={formError} /> : null}

          <div className="space-y-2">
            <Label htmlFor="sourceUrl">Approved Reel/Short Link</Label>
            <Input
              id="sourceUrl"
              name="sourceUrl"
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder="Paste Instagram Reel or YouTube Shorts link"
              value={sourceUrl}
              onChange={(event) => handleUrlChange(event.target.value)}
              aria-invalid={urlError ? true : undefined}
              aria-describedby={urlError ? 'sourceUrl-error' : undefined}
            />
            {urlError ? (
              <p id="sourceUrl-error" className="text-sm text-destructive" role="alert">
                {urlError}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="sourcePlatform">Platform</Label>
            <select
              id="sourcePlatform"
              aria-label="Platform"
              className={selectClassName}
              value={sourcePlatform}
              onChange={(event) =>
                setSourcePlatform(event.target.value as 'youtube' | 'instagram' | '')
              }
            >
              <option value="">Select platform</option>
              <option value="youtube">YouTube</option>
              <option value="instagram">Instagram</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nicheId">Niche</Label>
            <select
              id="nicheId"
              aria-label="Niche"
              className={selectClassName}
              value={nicheId}
              onChange={(event) => setNicheId(event.target.value)}
            >
              <option value="">Select niche</option>
              {niches.map((niche) => (
                <option key={niche.id} value={niche.id}>
                  {niche.name}
                </option>
              ))}
            </select>
            {!nicheId && sourceUrl ? (
              <p className="text-sm text-muted-foreground">Please select a niche.</p>
            ) : null}
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              id="rightsConfirmed"
              checked={rightsConfirmed}
              onCheckedChange={(checked) => setRightsConfirmed(checked === true)}
              aria-describedby="rightsConfirmed-label"
            />
            <Label
              id="rightsConfirmed-label"
              htmlFor="rightsConfirmed"
              className="cursor-pointer font-normal leading-snug"
            >
              I confirm this content is client-approved and we have permission to process and
              publish it.
            </Label>
          </div>
          {!rightsConfirmed && nicheId ? (
            <p className="text-sm text-muted-foreground">
              Please confirm rights permission before submitting.
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={!canSubmit}>
            {isPending ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Submitting...
              </>
            ) : (
              'Submit'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
