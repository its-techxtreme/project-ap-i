'use client'

import { useState, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import Script from 'next/script'
import { Anchor, Compass, KeyRound } from 'lucide-react'

import { adminLogin, demoLogin } from '@/app/actions/adminLogin'
import { ErrorAlert } from '@/components/app/ErrorAlert'
import { PirateSky } from '@/components/pirate/PirateSky'
import { CrewDoodles } from '@/components/pirate/CrewDoodles'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DEMO_TUTORIAL_FORCE_KEY } from '@/lib/demo/tutorial-steps'
import { themeInitScript } from '@/lib/theme/themeInit'

export function LoginForm() {
  const searchParams = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [demoPending, startDemoTransition] = useTransition()

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
        setError('Boarding failed. Check your papers.')
      }
    })
  }

  function handleDemoLogin() {
    setError(null)
    try {
      window.sessionStorage.setItem(DEMO_TUTORIAL_FORCE_KEY, '1')
    } catch {
      /* ignore */
    }

    startDemoTransition(async () => {
      try {
        const result = await demoLogin()
        if (result && !result.success) {
          setError(result.error)
        }
      } catch (err) {
        const digest = err && typeof err === 'object' && 'digest' in err ? String(err.digest) : ''
        if (digest.startsWith('NEXT_REDIRECT')) return
        setError('Demo boarding failed. Try again shortly.')
      }
    })
  }

  const busy = pending || demoPending

  return (
    <ThemeProvider surface="admin">
      <Script id="theme-init-login" strategy="beforeInteractive">
        {themeInitScript('admin')}
      </Script>
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
        <PirateSky />
        <div className="login-grid pointer-events-none absolute inset-0 z-[1] opacity-[0.25]" aria-hidden />

        <div className="absolute right-4 top-4 z-20">
          <ThemeToggle />
        </div>

        <CrewDoodles
          className="z-10 max-w-md"
          hero={
            <div className="mb-6 space-y-2 px-14 text-center sm:px-16">
              <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary shadow-[0_0_40px_-12px_hsl(var(--lantern)/0.7)]">
                <Anchor className="size-6" aria-hidden />
              </div>
              <p className="font-display text-4xl tracking-wide text-foreground md:text-5xl">
                Project AP-I
              </p>
              <p className="text-sm text-muted-foreground">
                Captain&apos;s Deck · board with leave papers
              </p>
            </div>
          }
          form={
            <>
              <div className="glass-panel rounded-xl p-6 sm:p-7">
                <div className="mb-5 flex items-center gap-2 text-muted-foreground">
                  <KeyRound className="size-4 text-primary" aria-hidden />
                  <h1 className="font-display text-xl tracking-wide text-foreground">
                    Captain&apos;s gate
                  </h1>
                </div>
                <p className="mb-5 text-sm text-muted-foreground">
                  Sign in to steer the voyage — cargo jobs, crew accounts, and lost cargo reviews.
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
                      disabled={busy}
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
                      disabled={busy}
                    />
                  </div>
                  <Button type="submit" className="h-11 w-full cursor-pointer" disabled={busy}>
                    {pending ? 'Boarding…' : 'Board the deck'}
                  </Button>
                </form>

                <div className="relative my-5">
                  <div className="absolute inset-0 flex items-center" aria-hidden>
                    <div className="w-full border-t border-border/60" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-card/80 px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground backdrop-blur-sm">
                      or
                    </span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full cursor-pointer gap-2 border-primary/35 bg-primary/8 text-foreground hover:border-primary/55 hover:bg-primary/15"
                  disabled={busy}
                  onClick={handleDemoLogin}
                  data-testid="demo-login-button"
                >
                  <Compass className="size-4 text-primary" aria-hidden />
                  {demoPending ? 'Casting off…' : 'Demo voyage — board & tour'}
                </Button>
                <p className="mt-2.5 text-center text-[11px] leading-relaxed text-muted-foreground">
                  Read-only demo watch with a crew briefing of the Captain&apos;s Deck.
                </p>
              </div>

              <p className="mt-5 text-center text-[11px] tracking-wide text-muted-foreground/80">
                Secured session · 12 hour watch
              </p>
            </>
          }
        />
      </div>
    </ThemeProvider>
  )
}
