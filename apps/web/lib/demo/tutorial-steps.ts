import type { CrewMascotId } from '@/lib/demo/crewMascots'
import type { TutorialAction } from '@/lib/demo/tutorial-bus'

/** Bump to re-show the briefing for returning demo sailors. */
export const DEMO_TUTORIAL_STORAGE_KEY = 'project_api_demo_voyage_v1'

/** Set by demo-login so the briefing always starts after boarding. */
export const DEMO_TUTORIAL_FORCE_KEY = 'project_api_demo_voyage_force'

export type TutorialStepId =
  | 'welcome'
  | 'demo-watch'
  | 'metrics'
  | 'jobs'
  | 'filters'
  | 'failed'
  | 'accounts'
  | 'niches'
  | 'logs'
  | 'cargo-bay'
  | 'done'

export type PointerSide = 'top' | 'bottom' | 'left' | 'right'

export type TutorialStep = {
  id: TutorialStepId
  mascot: CrewMascotId
  title: string
  speech: string
  targetSelector: string | null
  requireAction: TutorialAction | null
  tryHint: string
  pointerSide: PointerSide
  maxSpotWidth?: number
  maxSpotHeight?: number
  /** Prefer this route before spotlighting (nav steps). */
  preferPath?: string
}

export const DEMO_TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    mascot: 'stretch',
    title: 'Voyage briefing!',
    speech:
      "Ahoy — I'm Stretch, lookout of Project AP-I. This is a read-only demo watch. Follow the lantern glow, tap what I point at, and we'll chart the whole Captain's Deck.",
    targetSelector: null,
    requireAction: null,
    tryHint: 'Press Start voyage to begin.',
    pointerSide: 'bottom',
  },
  {
    id: 'demo-watch',
    mascot: 'chirp',
    title: 'Demo watch rules',
    speech:
      "Chirp here. You're on a demo watch — browse freely, but retry, delete, and other write actions stay locked ashore so you can't scuttle live cargo.",
    targetSelector: '[data-tutorial="demo-banner"]',
    requireAction: null,
    tryHint: 'Read the amber notice, then Continue.',
    pointerSide: 'bottom',
    preferPath: '/admin',
  },
  {
    id: 'metrics',
    mascot: 'navigator',
    title: 'Read the crow\'s nest',
    speech:
      "I'm Navi. These tiles are your voyage scoreboard — docked jobs, under weigh, landed today, lost cargo. Tap the metrics grid so you know where to glance mid-watch.",
    targetSelector: '[data-tutorial="metrics"]',
    requireAction: 'view-metrics',
    tryHint: 'Click the metrics tiles.',
    pointerSide: 'bottom',
    preferPath: '/admin',
    maxSpotHeight: 220,
  },
  {
    id: 'jobs',
    mascot: 'cook',
    title: "Open the ship's log",
    speech:
      "Cookie speaking. Ship's Log is every cargo job in the queue. Steer there from the rail (or Nest on mobile).",
    targetSelector: '[data-tutorial="nav-jobs"]',
    requireAction: 'visit-jobs',
    tryHint: "Click Ship's log / Log.",
    pointerSide: 'bottom',
  },
  {
    id: 'filters',
    mascot: 'cook',
    title: 'Trim the cargo list',
    speech:
      'Filter by niche, platform, or status. Try flipping a status chip — demo data only, nothing ships for real.',
    targetSelector: '[data-tutorial="job-filters"]',
    requireAction: 'filter-jobs',
    tryHint: 'Change any job filter.',
    pointerSide: 'bottom',
    preferPath: '/admin/jobs',
  },
  {
    id: 'failed',
    mascot: 'blades',
    title: 'Inspect lost cargo',
    speech:
      "Blades here. Lost Cargo is twice-failed jobs and Drive files waiting on the captain. Demo can't delete — real captains clean from here.",
    targetSelector: '[data-tutorial="nav-failed"]',
    requireAction: 'visit-failed',
    tryHint: 'Click Lost cargo / Lost.',
    pointerSide: 'bottom',
  },
  {
    id: 'accounts',
    mascot: 'blades',
    title: 'Meet the crew',
    speech:
      'Crew maps each niche to exactly one YouTube + one Instagram account. If a profile needs login, it lights up here.',
    targetSelector: '[data-tutorial="nav-accounts"]',
    requireAction: 'visit-accounts',
    tryHint: 'Click Crew.',
    pointerSide: 'bottom',
  },
  {
    id: 'niches',
    mascot: 'navigator',
    title: 'Chart the sea lanes',
    speech:
      'Sea Lanes are the niches: Memes, Anime, Sports. Submitters pick a lane; the worker routes uploads from there.',
    targetSelector: '[data-tutorial="nav-niches"]',
    requireAction: 'visit-niches',
    tryHint: 'Click Sea lanes / Lanes.',
    pointerSide: 'bottom',
  },
  {
    id: 'logs',
    mascot: 'chirp',
    title: 'Open the logbook',
    speech:
      'Logbook holds audit trails and job events — who boarded, what failed, what got cleaned. Handy when something smells fishy.',
    targetSelector: '[data-tutorial="nav-logs"]',
    requireAction: 'visit-logs',
    tryHint: 'Click Logbook / Book.',
    pointerSide: 'bottom',
  },
  {
    id: 'cargo-bay',
    mascot: 'stretch',
    title: 'Visit the cargo bay',
    speech:
      'Cargo Bay is the public submit form — link, platform, niche, rights. Open it in a new tab; anyone can drop approved cargo there.',
    targetSelector: '[data-tutorial="cargo-bay"]',
    requireAction: 'open-cargo-bay',
    tryHint: 'Click Cargo bay in the top bar.',
    pointerSide: 'bottom',
  },
  {
    id: 'done',
    mascot: 'stretch',
    title: 'Voyage complete!',
    speech:
      "You've charted the deck. Explore freely on this demo watch — when you're ready to run real cargo, the captain fits you with write papers.",
    targetSelector: null,
    requireAction: null,
    tryHint: 'Claim your finish flag.',
    pointerSide: 'bottom',
  },
]
