import { redirect } from 'next/navigation'

import { getSession } from '@/lib/auth/getSession'
import { createClient } from '@/lib/supabase/server'

import { SubmitForm } from './SubmitForm'

export default async function SubmitPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const supabase = await createClient()
  const { data: niches } = await supabase
    .from('niches')
    .select('id, name, slug')
    .eq('is_active', true)
    .order('name')

  return (
    <div className="mx-auto flex w-full max-w-md flex-col justify-center py-6">
      <SubmitForm niches={niches ?? []} />
    </div>
  )
}
