import { NextResponse, type NextRequest } from 'next/server'

import { AUTH_COOKIES, fetchUserProfile, refreshWithProfile } from '@/lib/auth'
import { clearAuthCookies, setAuthCookies } from '@/lib/auth-cookies'

const STUDENT_PREFIX = '/student'
const PROFILE_PREFIX = '/profile'
const ADMIN_PREFIX = '/admin'
const ACTIVATOR_PREFIX = '/activator'
const AUTH_PREFIX = '/auth'
const PENDING_PATH = '/student/pending'
const TUTOR_PREFIX = '/tutor'
const ADMIN_PENDING_PATH = '/admin/pending'
const TUTOR_PENDING_PATH = '/tutor/pending'


function roleHome(role: string | null, isActive: boolean) {
  if (role === 'admin') {
    return isActive ? '/admin' : '/admin/pending'
  }
  if (role === 'tutor') {
    return isActive ? '/tutor' : '/tutor/pending'
  }
  if (role === 'activator') {
    return '/activator'
  }
  return isActive ? '/student' : '/student/pending'
}

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
      refreshed = await refreshWithProfile(apiBaseUrl, refreshToken, request.headers)
      didRefresh = true
      accessToken = refreshed.tokens.accessToken
      role = refreshed.profile.role ?? 'student'
      active = String(refreshed.profile.isActive === true)
      accessExpiresAt = String(Date.now() + refreshed.tokens.expiresIn * 1000)
    } catch {
      const response = NextResponse.redirect(new URL('/', request.url))
      clearAuthCookies(response)
      return response
    }
  }

  if (accessToken) {
    try {
      const profile = await fetchUserProfile(apiBaseUrl, accessToken, request.headers)
      role = profile.role ?? 'student'
      active = String(profile.isActive === true)
    } catch {
      const response = NextResponse.redirect(new URL('/', request.url))
      clearAuthCookies(response)
      return response
    }
  }

  const isAuthenticated = Boolean(accessToken) && !isExpired(accessExpiresAt)
  const isAdmin = role === 'admin'
  const isTutor = role === 'tutor'
  const isActivator = role === 'activator'
  const isActive = active === 'true'

  const isAuthRoute = pathname.startsWith(AUTH_PREFIX)
  const isAdminRoute = pathname.startsWith(ADMIN_PREFIX)
  const isTutorRoute = pathname.startsWith(TUTOR_PREFIX)
  const isActivatorRoute = pathname.startsWith(ACTIVATOR_PREFIX)
  const isPendingRoute = pathname.startsWith(PENDING_PATH)
  const isAdminPendingRoute = pathname.startsWith(ADMIN_PENDING_PATH)
  const isTutorPendingRoute = pathname.startsWith(TUTOR_PENDING_PATH)

  const isStudentRoute = pathname.startsWith(STUDENT_PREFIX)
  const isProfileRoute = pathname.startsWith(PROFILE_PREFIX)
  const isHome = pathname === '/'

  if (
    !isAuthenticated &&
    (
      isAdminRoute ||
      isTutorRoute ||
      isActivatorRoute ||
      isStudentRoute ||
      isProfileRoute ||
      isPendingRoute ||
      pathname.startsWith(ADMIN_PENDING_PATH) ||
      pathname.startsWith(TUTOR_PENDING_PATH)
    )
  ) {
    const destination = `/auth/login?next=${encodeURIComponent(`${pathname}${request.nextUrl.search}`)}`
    return NextResponse.redirect(new URL(destination, request.url))
  }

  if (isAuthenticated && (isAuthRoute || isHome)) {
    const destination = roleHome(role, isActive)
    const response = NextResponse.redirect(new URL(destination, request.url))
    if (refreshed && didRefresh) {
      setAuthCookies(response, refreshed.tokens, remember)
    }
    return response
  }

  if (isAuthenticated && isAdminRoute && !isAdmin) {
    const destination = roleHome(role, isActive)
    return NextResponse.redirect(new URL(destination, request.url))
  }

  if (isAuthenticated && isTutorRoute && !isTutor) {
    const destination = roleHome(role, isActive)
    return NextResponse.redirect(new URL(destination, request.url))
  }

  if (isAuthenticated && isActivatorRoute && !isActivator) {
    const destination = roleHome(role, isActive)
    return NextResponse.redirect(new URL(destination, request.url))
  }

  if (isAuthenticated && isStudentRoute) {
    if (isAdmin || isTutor || isActivator) {
      const destination = roleHome(role, isActive)
      return NextResponse.redirect(new URL(destination, request.url))
    }
    if (!isActive && !isPendingRoute) {
      return NextResponse.redirect(new URL('/student/pending', request.url))
    }
  }

  if (isAuthenticated && isPendingRoute) {
    if (isAdmin || isTutor || isActivator || isActive) {
      const destination = roleHome(role, isActive)
      return NextResponse.redirect(new URL(destination, request.url))
    }
  }

  if (isAuthenticated && (isAdminPendingRoute || isTutorPendingRoute)) {
    const destination = roleHome(role, isActive)
    if (pathname !== destination) {
      return NextResponse.redirect(new URL(destination, request.url))
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
