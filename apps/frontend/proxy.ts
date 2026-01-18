import { NextResponse, type NextRequest } from 'next/server'

import { AUTH_COOKIES, fetchUserProfile, refreshWithProfile } from '@/lib/auth'
import { clearAuthCookies, setAuthCookies } from '@/lib/auth-cookies'

const PROTECTED_PREFIXES = ['/dashboard', '/profile']
const ADMIN_PREFIX = '/admin'
const AUTH_PREFIX = '/auth'
const PENDING_PATH = '/pending'

function isExpired(expiresAt: string | undefined) {
  if (!expiresAt) {
    return true
  }
  const timestamp = Number(expiresAt)
  if (!Number.isFinite(timestamp)) {
    return true
  }
  return Date.now() >= timestamp
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next()
  }

  const apiBaseUrl =
    process.env.API_BASE_URL ?? 'http://localhost:9999'

  let accessToken = request.cookies.get(AUTH_COOKIES.access)?.value
  const refreshToken = request.cookies.get(AUTH_COOKIES.refresh)?.value
  let role: string | null = null
  let active: string | null = null
  let accessExpiresAt = request.cookies.get(AUTH_COOKIES.accessExpiresAt)?.value
  const remember = request.cookies.get(AUTH_COOKIES.remember)?.value === 'true'

  let refreshed: Awaited<ReturnType<typeof refreshWithProfile>> | null = null
  let didRefresh = false

  const needsRefresh = !accessToken || isExpired(accessExpiresAt)

  if (refreshToken && needsRefresh) {
    try {
      refreshed = await refreshWithProfile(apiBaseUrl, refreshToken)
      didRefresh = true
      accessToken = refreshed.tokens.accessToken
      role = refreshed.profile.role ?? 'student'
      active = String(refreshed.profile.isActive === true)
      accessExpiresAt = String(Date.now() + refreshed.tokens.expiresIn * 1000)
    } catch (error) {
      const response = NextResponse.redirect(new URL('/', request.url))
      clearAuthCookies(response)
      return response
    }
  }

  if (accessToken) {
    try {
      const profile = await fetchUserProfile(apiBaseUrl, accessToken)
      role = profile.role ?? 'student'
      active = String(profile.isActive === true)
    } catch (error) {
      const response = NextResponse.redirect(new URL('/', request.url))
      clearAuthCookies(response)
      return response
    }
  }

  const isAuthenticated = Boolean(accessToken) && !isExpired(accessExpiresAt)
  const isAdmin = role === 'admin'
  const isActive = active === 'true'

  const isAuthRoute = pathname.startsWith(AUTH_PREFIX)
  const isAdminRoute = pathname.startsWith(ADMIN_PREFIX)
  const isPendingRoute = pathname.startsWith(PENDING_PATH)
  const isProtectedRoute = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  )
  const isHome = pathname === '/'

  if (!isAuthenticated && (isAdminRoute || isProtectedRoute || isPendingRoute)) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  if (isAuthenticated && (isAuthRoute || isHome)) {
    const destination = isAdmin
      ? '/admin'
      : isActive
        ? '/dashboard'
        : '/pending'
    const response = NextResponse.redirect(new URL(destination, request.url))
    if (refreshed && didRefresh) {
      setAuthCookies(response, refreshed.tokens, remember)
    }
    return response
  }

  if (isAuthenticated && isAdminRoute && !isAdmin) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  if (isAuthenticated && isProtectedRoute) {
    if (isAdmin) {
      return NextResponse.redirect(new URL('/admin', request.url))
    }
    if (!isActive) {
      return NextResponse.redirect(new URL('/pending', request.url))
    }
  }

  if (isAuthenticated && isPendingRoute) {
    if (isAdmin || isActive) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  const response = NextResponse.next()
  if (refreshed && didRefresh) {
    setAuthCookies(response, refreshed.tokens, remember)
  }
  return response
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|api).*)']
}
