'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Check, MousePointer2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { CREW_MASCOTS } from '@/lib/demo/crewMascots'
import {
  pathMatchesTutorialAction,
  subscribeTutorialAction,
  type TutorialAction,
} from '@/lib/demo/tutorial-bus'
import {
  DEMO_TUTORIAL_STEPS,
  DEMO_TUTORIAL_STORAGE_KEY,
  type PointerSide,
  type TutorialStep,
} from '@/lib/demo/tutorial-steps'

type SpotRect = {
  top: number
  left: number
  width: number
  height: number
}

const PAD = 10

function readTargetRect(step: TutorialStep): SpotRect | null {
  if (!step.targetSelector || typeof document === 'undefined') return null

  const candidates = document.querySelectorAll(step.targetSelector)
  let el: HTMLElement | null = null
  for (const node of candidates) {
    if (!(node instanceof HTMLElement)) continue
    const rect = node.getBoundingClientRect()
    // Sidebar and mobile nav share the selector. Use the node that is actually on screen.
    if (rect.width >= 2 && rect.height >= 2) {
      el = node
      break
    }
  }
  if (!el) return null

  try {
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
  } catch {
    /* ignore */
  }

  const rect = el.getBoundingClientRect()
  if (rect.width < 2 || rect.height < 2) return null

  let width = rect.width + PAD * 2
  let height = rect.height + PAD * 2
  let left = rect.left - PAD
  let top = rect.top - PAD

  if (step.maxSpotWidth && width > step.maxSpotWidth) {
    left += (width - step.maxSpotWidth) / 2
    width = step.maxSpotWidth
  }
  if (step.maxSpotHeight && height > step.maxSpotHeight) {
    top += (height - step.maxSpotHeight) / 2
    height = step.maxSpotHeight
  }

  return {
    top: Math.max(4, top),
    left: Math.max(4, left),
    width,
    height,
  }
}

function pointerStyle(spot: SpotRect, side: PointerSide): CSSProperties {
  const cx = spot.left + spot.width / 2
  const cy = spot.top + spot.height / 2
  switch (side) {
    case 'top':
      return { top: spot.top - 52, left: cx - 22 }
    case 'left':
      return { top: cy - 22, left: spot.left - 56 }
    case 'right':
      return { top: cy - 22, left: spot.left + spot.width + 12 }
    case 'bottom':
    default:
      return { top: spot.top + spot.height + 8, left: cx - 22 }
  }
}

function coachPlacement(spot: SpotRect | null): CSSProperties {
  if (!spot || typeof window === 'undefined') {
    return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
  }

  const panelW = Math.min(window.innerWidth - 24, 380)
  const preferBelow = spot.top + spot.height < window.innerHeight * 0.48
  const left = Math.min(
    Math.max(12, spot.left + spot.width / 2 - panelW / 2),
    window.innerWidth - panelW - 12,
  )

  if (preferBelow) {
    return {
      left,
      top: Math.min(window.innerHeight - 280, spot.top + spot.height + 56),
    }
  }

  return { left, bottom: Math.max(12, window.innerHeight - spot.top + 56) }
}

export function DemoTutorialOverlay({ forceStart = false }: { forceStart?: boolean }) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [actionDone, setActionDone] = useState(false)
  const [showCheckpoint, setShowCheckpoint] = useState(false)
  const [spot, setSpot] = useState<SpotRect | null>(null)

  const step = DEMO_TUTORIAL_STEPS[stepIndex]!
  const meta = CREW_MASCOTS[step.mascot]
  const needsAction = step.requireAction !== null
  const canAdvance = !needsAction || actionDone
  const isLast = stepIndex >= DEMO_TUTORIAL_STEPS.length - 1
  const progress = ((stepIndex + (actionDone ? 1 : 0)) / DEMO_TUTORIAL_STEPS.length) * 100
  const forceApplied = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    if (forceStart && !forceApplied.current) {
      forceApplied.current = true
      try {
        window.localStorage.removeItem(DEMO_TUTORIAL_STORAGE_KEY)
      } catch {
        /* ignore */
      }
      setOpen(true)
      setStepIndex(0)
      return
    }

    if (forceApplied.current) return

    try {
      if (window.localStorage.getItem(DEMO_TUTORIAL_STORAGE_KEY) === '1') return
    } catch {
      /* ignore */
    }
    setOpen(true)
  }, [forceStart])

  // This step's button lives on another page. Send them there first.
  useEffect(() => {
    if (!open || !step.preferPath) return
    if (pathname === step.preferPath || pathname.startsWith(`${step.preferPath}/`)) return
    if (step.requireAction && pathMatchesTutorialAction(step.requireAction, pathname)) return
    router.push(step.preferPath)
  }, [open, step, pathname, router])

  const refreshSpot = useCallback(() => {
    setSpot(readTargetRect(step))
  }, [step])

  useLayoutEffect(() => {
    if (!open) return
    setActionDone(false)
    setShowCheckpoint(false)
    const frame = window.requestAnimationFrame(() => refreshSpot())
    return () => window.cancelAnimationFrame(frame)
  }, [open, stepIndex, refreshSpot, pathname])

  useEffect(() => {
    if (!open) return
    const onResize = () => refreshSpot()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    const interval = window.setInterval(refreshSpot, 350)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
      window.clearInterval(interval)
    }
  }, [open, refreshSpot])

  const markAction = useCallback(
    (action: TutorialAction) => {
      if (!step.requireAction || action !== step.requireAction || actionDone) return
      setActionDone(true)
      setShowCheckpoint(true)
    },
    [step.requireAction, actionDone],
  )

  useEffect(() => {
    if (!open || !step.requireAction) return
    return subscribeTutorialAction(markAction)
  }, [open, step.requireAction, markAction])

  // Already on that route. Count the nav step as done.
  useEffect(() => {
    if (!open || !step.requireAction) return
    if (pathMatchesTutorialAction(step.requireAction, pathname)) {
      markAction(step.requireAction)
    }
  }, [open, step.requireAction, pathname, markAction])

  useEffect(() => {
    if (!open || !actionDone || !step.requireAction) return
    const timer = window.setTimeout(() => {
      setShowCheckpoint(false)
      if (stepIndex >= DEMO_TUTORIAL_STEPS.length - 1) return
      setStepIndex((i) => i + 1)
    }, 1100)
    return () => window.clearTimeout(timer)
  }, [actionDone, open, step.requireAction, stepIndex])

  const finish = useCallback(() => {
    try {
      window.localStorage.setItem(DEMO_TUTORIAL_STORAGE_KEY, '1')
    } catch {
      /* ignore */
    }
    setOpen(false)
  }, [])

  const next = useCallback(() => {
    if (!canAdvance) return
    if (isLast) {
      finish()
      return
    }
    if (!needsAction) {
      setShowCheckpoint(true)
      window.setTimeout(() => {
        setShowCheckpoint(false)
        setStepIndex((i) => i + 1)
      }, 700)
      return
    }
    setStepIndex((i) => i + 1)
  }, [canAdvance, isLast, finish, needsAction])

  const skip = useCallback(() => {
    finish()
  }, [finish])

  if (!open) return null

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[80]"
      data-testid="demo-tutorial"
      aria-live="polite"
    >
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-[82] h-1.5 bg-foreground/20">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${Math.min(100, progress)}%` }}
          data-testid="demo-tutorial-progress"
        />
      </div>

      {spot ? (
        <>
          <div
            className="pointer-events-none absolute left-0 right-0 top-0 bg-background/75"
            style={{ height: Math.max(0, spot.top) }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute bottom-0 left-0 right-0 bg-background/75"
            style={{ top: spot.top + spot.height }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute left-0 bg-background/75"
            style={{
              top: spot.top,
              height: spot.height,
              width: Math.max(0, spot.left),
            }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute right-0 bg-background/75"
            style={{
              top: spot.top,
              height: spot.height,
              left: spot.left + spot.width,
            }}
            aria-hidden
          />

          <div
            className="tutorial-pulse-ring pointer-events-none absolute rounded-xl border-[3px] border-primary bg-transparent"
            style={{
              top: spot.top,
              left: spot.left,
              width: spot.width,
              height: spot.height,
            }}
            data-testid="demo-tutorial-spotlight"
            aria-hidden
          />

          <div
            className={`pointer-events-none absolute z-[83] flex h-11 w-11 items-center justify-center rounded-full border-2 border-border bg-primary text-primary-foreground shadow-md ${
              step.pointerSide === 'left' || step.pointerSide === 'right'
                ? 'tutorial-pointer-x'
                : 'tutorial-pointer-y'
            }`}
            style={pointerStyle(spot, step.pointerSide)}
            data-testid="demo-tutorial-pointer"
            aria-hidden
          >
            <MousePointer2 className="h-5 w-5" strokeWidth={2.5} />
          </div>
        </>
      ) : (
        <div className="pointer-events-none absolute inset-0 bg-background/70" aria-hidden />
      )}

      {showCheckpoint ? (
        <div
          className="tutorial-checkpoint-flash pointer-events-none absolute left-1/2 top-1/2 z-[85] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-primary/40 bg-card px-5 py-3 font-display text-xl tracking-wide text-foreground shadow-lg"
          data-testid="demo-tutorial-checkpoint"
        >
          Checkpoint!
        </div>
      ) : null}

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-tutorial-title"
        className="pointer-events-auto absolute z-[84] w-[min(100%-1.5rem,23.75rem)] rounded-xl border border-border/80 bg-card/95 p-3 shadow-xl backdrop-blur-md sm:p-4"
        style={coachPlacement(spot)}
      >
        <button
          type="button"
          aria-label="Close tutorial"
          className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          onClick={skip}
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex gap-3">
          <div className="tutorial-mascot-bob relative h-[100px] w-[68px] shrink-0 sm:h-[120px] sm:w-[80px]">
            <img
              src={meta.src}
              alt={meta.vibe}
              className="h-full w-full object-contain object-bottom drop-shadow-[0_6px_12px_rgba(15,23,42,0.35)]"
            />
          </div>
          <div className="min-w-0 flex-1 pr-5">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-primary">
              {meta.name} says
            </p>
            <h2
              id="demo-tutorial-title"
              className="mt-0.5 font-display text-lg tracking-wide text-foreground sm:text-xl"
            >
              {step.title}
            </h2>
            <p
              className="mt-1.5 text-sm leading-relaxed text-muted-foreground"
              data-testid="demo-tutorial-speech"
            >
              {step.speech}
            </p>
            <p
              className={`mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider ${
                actionDone
                  ? 'bg-primary/15 text-primary'
                  : 'bg-muted/70 text-muted-foreground'
              }`}
              data-testid="demo-tutorial-hint"
            >
              {actionDone ? (
                <>
                  <Check className="h-3 w-3" aria-hidden />
                  Checkpoint cleared
                </>
              ) : (
                <>
                  <MousePointer2 className="h-3 w-3" aria-hidden />
                  {step.tryHint}
                </>
              )}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Stage {stepIndex + 1}/{DEMO_TUTORIAL_STEPS.length}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={skip}>
              Skip voyage
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={next}
              disabled={!canAdvance}
              data-testid="demo-tutorial-next"
            >
              {isLast
                ? 'Finish voyage'
                : needsAction && !actionDone
                  ? 'Do the action'
                  : stepIndex === 0
                    ? 'Start voyage'
                    : 'Continue'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
