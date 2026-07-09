'use client'

import { useState, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import Script from 'next/script'

import { adminLogin } from '@/app/actions/adminLogin'
import { ErrorAlert } from '@/components/app/ErrorAlert'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { themeInitScript } from '@/lib/theme/themeInit'

export function LoginForm() {
  const searchParams = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const next = searchParams.get('next')
    startTransition(async () => {
      try {
        const result = await adminLogin(username, password, next)
        if (result && !result.success) {
          setError(result.error)
        }
      } catch (err) {
        // Next.js redirect() throws; ignore redirect errors.
        const digest = err && typeof err === 'object' && 'digest' in err ? String(err.digest) : ''
        if (digest.startsWith('NEXT_REDIRECT')) return
        setError('Sign in failed.')
      }
    })
  }

  return (
    <ThemeProvider surface="admin">
      <Script id="theme-init-login" strategy="beforeInteractive">
        {themeInitScript('admin')}
      </Script>
      <div className="bg-atmosphere relative flex min-h-screen items-center justify-center p-4">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>
        <Card className="w-full max-w-md border-border/80 shadow-xl shadow-black/20">
          <CardHeader className="space-y-2">
            <p className="font-display text-sm font-medium text-primary">Project AP-I</p>
            <CardTitle className="font-display text-2xl">Admin sign-in</CardTitle>
            <CardDescription>
              Sign in with your admin username and password to manage jobs and reviews.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4" autoComplete="on">
              {error ? <ErrorAlert message={error} /> : null}
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  maxLength={64}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="h-11"
                  disabled={pending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={256}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-11"
                  disabled={pending}
                />
              </div>
              <Button
                type="submit"
                className="h-11 w-full cursor-pointer"
                disabled={pending}
              >
                {pending ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </ThemeProvider>
  )
}
