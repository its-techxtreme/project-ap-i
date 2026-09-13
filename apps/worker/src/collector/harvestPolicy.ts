/** Newest DMs sit at the bottom. Take unread/new URLs only; stop when history (already stored) appears. */
export const MAX_NEW_REELS_PER_THREAD = 15
export const MAX_SCROLL_UPS = 8
export const EMPTY_NO_CARD_ROUNDS = 2

export type HarvestDecision = 'take' | 'skip'

/** Stored or already grabbed this pass → skip. Never treat one known reel as end of chat. */
export function decideHarvestUrl(
  url: string | undefined,
  known: Set<string>,
  takenThisRun: Set<string>,
): HarvestDecision {
  if (!url) return 'skip'
  if (takenThisRun.has(url) || known.has(url)) return 'skip'
  return 'take'
}

export function newestFirst<T extends { y: number }>(cards: T[]): T[] {
  return [...cards].sort((a, b) => b.y - a.y)
}

export function shouldStopScrolling(args: {
  round: number
  maxScroll: number
  taken: number
  maxTaken: number
  cardCount: number
  noCardStreak: number
  noCardLimit: number
  newThisRound: number
  skippedKnownThisRound: number
}): boolean {
  if (args.taken >= args.maxTaken) return true
  if (args.round >= args.maxScroll) return true
  if (args.cardCount === 0 && args.noCardStreak >= args.noCardLimit) return true
  if (args.round > 0 && args.newThisRound === 0 && args.skippedKnownThisRound > 0) return true
  if (args.round > 0 && args.newThisRound === 0 && args.cardCount > 0) return true

  return false
}