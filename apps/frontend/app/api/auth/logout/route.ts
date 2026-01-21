import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { AUTH_COOKIES } from '@/lib/auth'
import { clearAuthCookies } from '@/lib/auth-cookies'

export async function POST() {
  const apiBaseUrl =
    process.env.API_BASE_URL ?? 'http://localhost:9999'
  const cookieStore = await cookies()
  const refreshToken = cookieStore.get(AUTH_COOKIES.refresh)?.value

  if (refreshToken) {
    try {
      await fetch(`${apiBaseUrl}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ refreshToken })
      })
    } catch {
      // Ignore network errors; we still clear cookies locally.
    }
  }

  const response = NextResponse.json({ success: true })
  clearAuthCookies(response)
  return response
}
