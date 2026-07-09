import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '@/lib/auth/adminSession'

function isPublicPath(pathname: string): boolean {
  if (pathname === '/' || pathname === '/submit') return true
  if (pathname === '/login') return true
  if (pathname.startsWith('/_next')) return true
  return false
}

function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/')
}

async function hasValidAdminSession(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value
  return (await verifyAdminSessionToken(token)) !== null
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  // Keep Supabase cookie refresh for any remaining auth usage (non-admin).
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Touch auth so cookies refresh; ignore result for admin gate.
  await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isAdmin = await hasValidAdminSession(request)

  if (isAdminPath(pathname) && !isAdmin) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (isAdmin && pathname === '/login') {
    const next = request.nextUrl.searchParams.get('next')
    const dest = next && next.startsWith('/admin') ? next : '/admin'
    return NextResponse.redirect(new URL(dest, request.url))
  }

  if (!isAdmin && !isPublicPath(pathname)) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
