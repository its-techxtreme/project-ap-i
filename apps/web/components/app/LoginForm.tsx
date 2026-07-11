'use client'

import { useState, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import Script from 'next/script'
import { LockKeyhole, ShieldCheck } from 'lucide-react'

import { adminLogin } from '@/app/actions/adminLogin'
import { ErrorAlert } from '@/components/app/ErrorAlert'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { Button } from '@/components/ui/button'
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
      <div className="bg-atmosphere login-stage relative flex min-h-screen items-center justify-center overflow-hidden p-4">
        {/* Decorative atmosphere graphics */}
        <div className="login-grid pointer-events-none absolute inset-0 opacity-[0.35]" aria-hidden />
        <div
          className="pointer-events-none absolute -left-24 top-10 size-[32rem] rounded-full bg-primary/25 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-10 bottom-8 size-[26rem] rounded-full bg-teal-400/15 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute left-[12%] top-[38%] size-40 rounded-full bg-primary/20 blur-2xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute right-[18%] top-[28%] size-28 rounded-full bg-cyan-300/10 blur-2xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 size-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/15"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 size-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/8"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 size-[20rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/5"
          aria-hidden
        />

        <div className="absolute right-4 top-4 z-20">
          <ThemeToggle />
        </div>

        <div className="relative z-10 w-full max-w-md animate-enter">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary shadow-[0_0_40px_-12px_hsl(var(--primary)/0.7)]">
              <ShieldCheck className="size-6" aria-hidden />
            </div>
            <p className="font-display text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              Project AP-I
            </p>
            <p className="mt-2 text-sm text-muted-foreground">Ops console · admin access</p>
          </div>

          <div className="glass-panel rounded-2xl p-6 backdrop-blur-xl sm:p-7">
            <div className="mb-5 flex items-center gap-2 text-muted-foreground">
              <LockKeyhole className="size-4 text-primary" aria-hidden />
              <h1 className="font-display text-lg font-semibold tracking-tight text-foreground">
                Admin sign-in
              </h1>
            </div>
            <p className="mb-5 text-sm text-muted-foreground">
              Sign in with your admin username and password to manage jobs and reviews.
            </p>

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
                  className="h-11 border-border/60 bg-background/40 backdrop-blur-sm"
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
                  className="h-11 border-border/60 bg-background/40 backdrop-blur-sm"
                  disabled={pending}
                />
              </div>
              <Button type="submit" className="h-11 w-full cursor-pointer" disabled={pending}>
                {pending ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </div>

          <p className="mt-5 text-center text-[11px] tracking-wide text-muted-foreground/80">
            Secured session · 12 hour TTL
          </p>
        </div>
      </div>
    </ThemeProvider>
  )
}
