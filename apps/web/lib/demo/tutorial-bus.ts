export type TutorialAction =
  | 'view-metrics'
  | 'visit-jobs'
  | 'filter-jobs'
  | 'visit-failed'
  | 'visit-accounts'
  | 'visit-niches'
  | 'visit-logs'
  | 'open-cargo-bay'

const EVENT_NAME = 'project-api:tutorial-action'

export function emitTutorialAction(action: TutorialAction): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(EVENT_NAME, {
      detail: { action },
    }),
  )
}

export function subscribeTutorialAction(
  handler: (action: TutorialAction) => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined

  const listener = (event: Event) => {
    const custom = event as CustomEvent<{ action?: TutorialAction }>
    const action = custom.detail?.action
    if (action) handler(action)
  }

  window.addEventListener(EVENT_NAME, listener)
  return () => window.removeEventListener(EVENT_NAME, listener)
}

/** Path-based auto-complete for nav voyage steps. */
export function pathMatchesTutorialAction(
  action: TutorialAction,
  pathname: string,
): boolean {
  switch (action) {
    case 'visit-jobs':
      return pathname === '/admin/jobs' || pathname.startsWith('/admin/jobs/')
    case 'visit-failed':
      return pathname.startsWith('/admin/failed')
    case 'visit-accounts':
      return pathname.startsWith('/admin/accounts')
    case 'visit-niches':
      return pathname.startsWith('/admin/niches')
    case 'visit-logs':
      return pathname.startsWith('/admin/logs')
    default:
      return false
  }
}
