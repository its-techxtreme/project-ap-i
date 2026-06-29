import Link from 'next/link'
import { redirect } from 'next/navigation'

import { ErrorAlert } from '@/components/app/ErrorAlert'
import { Button } from '@/components/ui/button'
import { getSession } from '@/lib/auth/getSession'

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const session = await getSession()
  const params = await searchParams

  if (params.error === 'forbidden') {
    return (
      <main className="mx-auto max-w-lg space-y-4 p-6">
        <ErrorAlert
          title="Access denied"
          message="You do not have permission to view that page."
        />
        {session ? (
          <Button asChild variant="outline">
            <Link href="/submit">Back to submit page</Link>
          </Button>
        ) : null}
      </main>
    )
  }

  if (session) {
    redirect('/submit')
  }

  redirect('/login')
}
