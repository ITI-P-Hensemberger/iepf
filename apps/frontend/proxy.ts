import { NextResponse, type NextRequest } from 'next/server'

import { AUTH_COOKIES, fetchUserProfile, isAuthRejected, refreshWithProfile, type AuthTokens } from '@/lib/auth'
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
// Reached from links in emails, so they must open for a user who is already signed in.
const EMAIL_LINK_PATHS = ['/auth/reset-password', '/auth/verify-email', '/auth/sign-up-tutor', '/auth/sign-up-admin']


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

function isProtectedPath(pathname: string) {
  return [ADMIN_PREFIX, TUTOR_PREFIX, ACTIVATOR_PREFIX, STUDENT_PREFIX, PROFILE_PREFIX]
    .some(prefix => pathname.startsWith(prefix))
}

const UNAVAILABLE_PAGE = `<!doctype html>
<html lang="it">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Servizio non disponibile</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:20vh auto;padding:0 1rem;text-align:center">
<h1>Servizio temporaneamente non disponibile</h1>
<p>La tua sessione è ancora attiva. Riprova tra qualche istante.</p>
<p><a href="">Riprova</a></p>
</body>
</html>`

// The backend failed without rejecting the session: keep the cookies, and only hold back
// pages that cannot be rendered without knowing who the user is.
function backendUnavailable(request: NextRequest, tokens: AuthTokens | null, remember: boolean) {
  const response = isProtectedPath(request.nextUrl.pathname)
    ? new NextResponse(UNAVAILABLE_PAGE, {
        status: 503,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '15' }
      })
    : NextResponse.next()
  if (tokens) {
    setAuthCookies(response, tokens, remember)
  }
  return response
}

function signOut(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/', request.url))
  clearAuthCookies(response)
  return response
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
      accessExpiresAt = String(Date.now() + refreshed.tokens.expiresIn * 1000)
    } catch (error) {
      return isAuthRejected(error) ? signOut(request) : backendUnavailable(request, null, remember)
    }
  }

  if (accessToken) {
    try {
      const profile = await fetchUserProfile(apiBaseUrl, accessToken, request.headers)
      role = profile.role ?? 'student'
      active = String(profile.isActive === true)
    } catch (error) {
      return isAuthRejected(error)
        ? signOut(request)
        : backendUnavailable(request, refreshed?.tokens ?? null, remember)
    }
  }

  const isAuthenticated = Boolean(accessToken) && !isExpired(accessExpiresAt)
  const isAdmin = role === 'admin'
  const isTutor = role === 'tutor'
  const isActivator = role === 'activator'
  const isActive = active === 'true'

  const isAuthRoute = pathname.startsWith(AUTH_PREFIX) && !EMAIL_LINK_PATHS.includes(pathname)
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
  // Static files need no session check: each one would call the backend and add an audit row.
  matcher: ['/((?!_next|favicon.ico|sw\\.js|api|.*\\.(?:png|jpe?g|gif|svg|webp|ico|txt|xml|webmanifest|woff2?)$).*)']
}
