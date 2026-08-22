import { headers } from 'next/headers'
import Script from 'next/script'

import { PublicHeader } from '@/components/app/PublicHeader'
import { CrewDoodles } from '@/components/pirate/CrewDoodles'
import { PirateSky } from '@/components/pirate/PirateSky'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { SubmitForm } from '@/app/submit/SubmitForm'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { themeInitScript } from '@/lib/theme/themeInit'

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams

  const { data: niches } = await supabaseAdmin
    .from('niches')
    .select('id, name, slug')
    .eq('is_active', true)
    .order('name')

  await headers()

  return (
    <ThemeProvider surface="public">
      <Script id="theme-init-public" strategy="beforeInteractive">
        {themeInitScript('public')}
      </Script>
      <div className="relative flex min-h-screen flex-col overflow-x-hidden">
        <PirateSky />
        <PublicHeader />
        <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-4 pb-16 pt-6 md:pt-10">
          {params.error === 'forbidden' ? (
            <p className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Access denied. Ye have no leave to board that deck.
            </p>
          ) : null}

          <CrewDoodles
            hero={
              <div className="animate-enter space-y-4 px-14 text-center sm:px-20 md:px-8">
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary drop-shadow-sm">
                  Short-form voyage intake
                </p>
                <h1 className="font-display text-5xl tracking-wide text-foreground drop-shadow-sm md:text-[4.35rem]">
                  Project AP-I
                </h1>
                <p className="mx-auto max-w-[22rem] text-base font-medium text-foreground/80 md:text-lg">
                  Load the cargo. Pick the crew lane. Set sail.
                </p>
              </div>
            }
            form={
              <div className="animate-enter" style={{ animationDelay: '80ms' }}>
                <SubmitForm niches={niches ?? []} />
              </div>
            }
          />
        </main>
      </div>
    </ThemeProvider>
  )
}
