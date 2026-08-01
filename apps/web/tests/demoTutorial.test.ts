import { describe, expect, it, vi } from 'vitest'

import {
  emitTutorialAction,
  pathMatchesTutorialAction,
  subscribeTutorialAction,
} from '@/lib/demo/tutorial-bus'
import { DEMO_TUTORIAL_STEPS, DEMO_TUTORIAL_STORAGE_KEY } from '@/lib/demo/tutorial-steps'
import { CREW_MASCOTS } from '@/lib/demo/crewMascots'

describe('tutorial-bus', () => {
  it('emits and delivers tutorial actions', () => {
    const handler = vi.fn()
    const unsubscribe = subscribeTutorialAction(handler)
    emitTutorialAction('visit-jobs')
    expect(handler).toHaveBeenCalledWith('visit-jobs')
    unsubscribe()
    emitTutorialAction('visit-failed')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('matches paths for visit actions', () => {
    expect(pathMatchesTutorialAction('visit-jobs', '/admin/jobs')).toBe(true)
    expect(pathMatchesTutorialAction('visit-jobs', '/admin/jobs/abc')).toBe(true)
    expect(pathMatchesTutorialAction('visit-jobs', '/admin')).toBe(false)
    expect(pathMatchesTutorialAction('visit-failed', '/admin/failed')).toBe(true)
    expect(pathMatchesTutorialAction('view-metrics', '/admin')).toBe(false)
  })
})

describe('tutorial-steps', () => {
  it('covers core deck areas with crew mascots', () => {
    expect(DEMO_TUTORIAL_STORAGE_KEY).toMatch(/project_api_demo_voyage/)
    expect(DEMO_TUTORIAL_STEPS.length).toBeGreaterThanOrEqual(8)
    expect(DEMO_TUTORIAL_STEPS[0]?.id).toBe('welcome')
    expect(DEMO_TUTORIAL_STEPS.at(-1)?.id).toBe('done')

    for (const step of DEMO_TUTORIAL_STEPS) {
      expect(CREW_MASCOTS[step.mascot]).toBeTruthy()
      expect(step.title.length).toBeGreaterThan(2)
      expect(step.speech.length).toBeGreaterThan(10)
    }

    const ids = DEMO_TUTORIAL_STEPS.map((s) => s.id)
    expect(ids).toContain('metrics')
    expect(ids).toContain('jobs')
    expect(ids).toContain('failed')
    expect(ids).toContain('accounts')
    expect(ids).toContain('cargo-bay')
  })
})
