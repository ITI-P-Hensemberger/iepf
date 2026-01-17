import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { AUTH_COOKIES, fetchUserProfile, refreshWithProfile } from '@/lib/auth'
import { setAuthCookies } from '@/lib/auth-cookies'

export async function GET() {
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:9999'
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(AUTH_COOKIES.access)?.value
  const refreshToken = cookieStore.get(AUTH_COOKIES.refresh)?.value
  const accessExpiresAt = cookieStore.get(AUTH_COOKIES.accessExpiresAt)?.value
  const remember = cookieStore.get(AUTH_COOKIES.remember)?.value === 'true'

  const isExpired =
    !accessExpiresAt || Number.isNaN(Number(accessExpiresAt))
      ? true
      : Date.now() >= Number(accessExpiresAt)

  try {
    if ((!accessToken || isExpired) && refreshToken) {
      const { tokens, profile } = await refreshWithProfile(
        apiBaseUrl,
        refreshToken
      )
      const response = NextResponse.json({
        role: profile.role ?? 'student',
        isActive: profile.isActive === true
      })
      setAuthCookies(response, tokens, remember)
      return response
    }

    if (!accessToken) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const profile = await fetchUserProfile(apiBaseUrl, accessToken)
    return NextResponse.json({
      role: profile.role ?? 'student',
      isActive: profile.isActive === true
    })
  } catch (error) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }
}
