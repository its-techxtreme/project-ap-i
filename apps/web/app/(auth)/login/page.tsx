import { Suspense } from 'react'

import { LoginForm } from '@/components/app/LoginForm'

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="bg-atmosphere min-h-screen" />}>
      <LoginForm />
    </Suspense>
  )
}
