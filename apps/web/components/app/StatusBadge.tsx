import { SignalBadge } from '@/components/desk/SignalBadge'

/** Back-compat wrapper — Captain's Deck signal badge. */
export function StatusBadge({ status }: { status: string }) {
  return <SignalBadge status={status} />
}
