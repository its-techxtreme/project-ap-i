import { headers } from 'next/headers'
import Script from 'next/script'

import { PublicHeader } from '@/components/app/PublicHeader'
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

  // Touch headers so Next treats this as dynamic (IP rate limit on submit).
  await headers()

  return (
    <ThemeProvider surface="public">
      <Script id="theme-init-public" strategy="beforeInteractive">
        {themeInitScript('public')}
      </Script>
      <div className="bg-atmosphere flex min-h-screen flex-col">
        <PublicHeader />
        <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 pb-16 pt-6 md:pt-10">
          {params.error === 'forbidden' ? (
            <p className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Access denied. You do not have permission to view that page.
            </p>
          ) : null}

          <div className="animate-enter mb-8 space-y-3 text-center">
            <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
              Project AP-I
            </h1>
            <p className="text-base text-muted-foreground md:text-lg">
              Paste an approved Reel or Short. Pick a niche. Submit.
            </p>
          </div>

          <div className="animate-enter" style={{ animationDelay: '80ms' }}>
            <SubmitForm niches={niches ?? []} />
          </div>
        </main>
      </div>
    </ThemeProvider>
  )
}
