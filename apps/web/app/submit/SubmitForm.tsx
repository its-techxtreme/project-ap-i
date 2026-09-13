'use client'

// Public submit. Link, platform, niche, rights, send. Nothing else.

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { detectPlatform, validateSourceUrl } from '@project-api/shared'

import { submitJobAction } from '@/app/actions/submitJob'
import { ErrorAlert } from '@/components/app/ErrorAlert'
import { ShipSuccess } from '@/components/pirate/ShipSuccess'
import { Button } from '@/components/ui/button'
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
  'flex h-11 w-full cursor-pointer rounded-lg border border-input bg-card/80 px-3 py-2 text-sm text-foreground ring-offset-background transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:[color-scheme:dark]',
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
      <ErrorAlert
        message="No active sea lane is configured. Hail the captain."
        title="Unavailable"
      />
    )
  }

  if (success) {
    return (
      <ShipSuccess
        nicheLabel={success.nicheLabel}
        platformLabel={success.platformLabel}
        publicJobCode={success.publicJobCode}
      />
    )
  }

  return (
    <div className="parchment-panel rounded-xl p-5 md:p-6">
      <div className="mb-5 space-y-1.5">
        <h2 className="font-display text-3xl tracking-wide text-foreground">Load the cargo</h2>
        <p className="text-sm text-muted-foreground">
          Paste a client-approved Reel or Short. Pick a sea lane. Confirm rights. Set sail.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
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
            className="h-11 bg-card/70"
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
            <option value="">Select sea lane</option>
            {niches.map((niche) => (
              <option key={niche.id} value={niche.id}>
                {niche.name}
              </option>
            ))}
          </select>
          {!nicheId && sourceUrl ? (
            <p className="text-sm text-muted-foreground">Please select a sea lane (niche).</p>
          ) : null}
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/35 p-3">
          <Checkbox
            id="rightsConfirmed"
            checked={rightsConfirmed}
            onCheckedChange={(checked) => setRightsConfirmed(checked === true)}
            aria-describedby="rightsConfirmed-label"
            className="mt-0.5"
          />
          <Label
            id="rightsConfirmed-label"
            htmlFor="rightsConfirmed"
            className="cursor-pointer font-normal leading-snug"
          >
            I confirm this content is client-approved and we have permission to process and publish
            it.
          </Label>
        </div>
        {!rightsConfirmed && nicheId ? (
          <p className="text-sm text-muted-foreground">
            Confirm rights before the cargo can board.
          </p>
        ) : null}

        <Button
          type="submit"
          className="h-12 w-full cursor-pointer text-base font-medium transition-all duration-200 hover:scale-[1.01]"
          disabled={!canSubmit}
        >
          {isPending ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Loading aboard…
            </>
          ) : (
            'Load aboard'
          )}
        </Button>
      </form>
    </div>
  )
}
