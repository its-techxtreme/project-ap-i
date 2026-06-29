import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { JobSummary } from '@/lib/data/adminQueries'

const cards: {
  key: keyof JobSummary
  label: string
  colorClass: string
}[] = [
  { key: 'queued', label: 'Queued jobs', colorClass: 'text-gray-700' },
  { key: 'processing', label: 'Processing now', colorClass: 'text-blue-700' },
  { key: 'completedToday', label: 'Completed today', colorClass: 'text-green-700' },
  { key: 'failedToday', label: 'Failed today', colorClass: 'text-red-700' },
  { key: 'needsManualReview', label: 'Needs manual review', colorClass: 'text-orange-700' },
  { key: 'loginRequiredAccounts', label: 'Login required accounts', colorClass: 'text-red-700' },
  { key: 'driveWaitingCleanup', label: 'Drive files waiting cleanup', colorClass: 'text-amber-700' },
]

export function OverviewCards({ summary }: { summary: JobSummary }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.key}>
          <CardHeader className="pb-2">
            <CardTitle className={`text-sm font-medium ${card.colorClass}`}>{card.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{summary[card.key]}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
