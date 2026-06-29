const statusColors: Record<string, string> = {
  queued: 'bg-gray-100 text-gray-700',
  locked: 'bg-blue-100 text-blue-700',
  processing: 'bg-blue-100 text-blue-700',
  ready_to_upload: 'bg-purple-100 text-purple-700',
  uploading: 'bg-indigo-100 text-indigo-700',
  awaiting_verification: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  needs_manual_review: 'bg-orange-100 text-orange-700',
  login_required: 'bg-red-100 text-red-700',
  ignored: 'bg-gray-100 text-gray-400',
}

export function StatusBadge({ status }: { status: string }) {
  const colorClass = statusColors[status] ?? 'bg-gray-100 text-gray-500'
  const label = status.replace(/_/g, ' ')

  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${colorClass}`}
      aria-label={`Status: ${label}`}
    >
      {label}
    </span>
  )
}
