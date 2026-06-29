import { redirect } from 'next/navigation'

import { EmptyState } from '@/components/app/EmptyState'
import { getSession } from '@/lib/auth/getSession'

export default async function SubmitPage() {
  const session = await getSession()
  if (!session) {
    redirect('/login')
  }

  return (
    <EmptyState
      title="Submit content"
      description="The submission form will be available in Phase 4. You are signed in and can access this route."
    />
  )
}
