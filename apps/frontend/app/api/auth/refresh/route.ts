import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { AUTH_COOKIES, isAuthRejected, refreshWithProfile } from '@/lib/auth'
import { clearAuthCookies, setAuthCookies } from '@/lib/auth-cookies'

export async function POST(request: Request) {
  const apiBaseUrl =
    process.env.API_BASE_URL ?? 'http://localhost:9999'
  const cookieStore = await cookies()
  const refreshToken = cookieStore.get(AUTH_COOKIES.refresh)?.value
  const remember = cookieStore.get(AUTH_COOKIES.remember)?.value === 'true'

  if (!refreshToken) {
    const response = NextResponse.json({ message: 'Missing refresh token.' }, { status: 401 })
    clearAuthCookies(response)
    return response
  }

  try {
    const { tokens, profile } = await refreshWithProfile(
      apiBaseUrl,
      refreshToken,
      request.headers
    )

    const response = NextResponse.json({
      role: profile ? profile.role ?? 'student' : null,
      isActive: profile?.isActive === true
    })
    setAuthCookies(response, tokens, remember)
    return response
  } catch (error) {
    if (!isAuthRejected(error)) {
      return NextResponse.json({ message: 'Service unavailable.' }, { status: 503 })
    }
    const response = NextResponse.json({ message: 'Refresh failed.' }, { status: 401 })
    clearAuthCookies(response)
    return response
  }
}
