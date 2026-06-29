import { Skeleton } from '@/components/ui/skeleton'

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-8 w-64" />
    </div>
  )
}
