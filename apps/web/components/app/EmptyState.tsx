export function EmptyState({
  title,
  description,
}: {
  title: string
  description?: string
}) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center"
      role="status"
    >
      <h2 className="text-lg font-semibold">{title}</h2>
      {description ? <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p> : null}
    </div>
  )
}
