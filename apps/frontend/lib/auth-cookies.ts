import { NextResponse } from 'next/server'

import { AUTH_COOKIES, type AuthTokens } from '@/lib/auth'

const isProd = process.env.NODE_ENV === 'production'

type CookieOptions = {
  httpOnly: boolean
  sameSite: 'lax'
  secure: boolean
  path: string
  maxAge?: number
}

function baseCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isProd,
    path: '/'
  } satisfies CookieOptions
}

export function setAuthCookies(
  response: NextResponse,
  tokens: AuthTokens,
  remember = true
) {
  const accessExpiresAt = Date.now() + tokens.expiresIn * 1000
  const refreshExpiresAt = Date.now() + tokens.refreshTokenExpiresIn * 1000

  const accessCookie: CookieOptions = baseCookieOptions()
  const refreshCookie: CookieOptions = baseCookieOptions()
  const metaCookie: CookieOptions = baseCookieOptions()

  if (remember) {
    accessCookie.maxAge = tokens.expiresIn
    refreshCookie.maxAge = tokens.refreshTokenExpiresIn
    metaCookie.maxAge = tokens.refreshTokenExpiresIn
  }

  response.cookies.set(AUTH_COOKIES.access, tokens.accessToken, accessCookie)
  response.cookies.set(AUTH_COOKIES.refresh, tokens.refreshToken, refreshCookie)
  response.cookies.set(
    AUTH_COOKIES.accessExpiresAt,
    String(accessExpiresAt),
    metaCookie
  )
  response.cookies.set(
    AUTH_COOKIES.refreshExpiresAt,
    String(refreshExpiresAt),
    metaCookie
  )

  response.cookies.set(AUTH_COOKIES.remember, String(remember), metaCookie)
}

export function clearAuthCookies(response: NextResponse) {
  Object.values(AUTH_COOKIES).forEach((name) => {
    response.cookies.set(name, '', {
      ...baseCookieOptions(),
      maxAge: 0
    })
  })
}
