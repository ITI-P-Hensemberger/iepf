import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { parseBackendPayload } from '@/lib/backend-response'
import { AUTH_COOKIES, IMPERSONATION_COOKIES } from '@/lib/auth'

const isProd = process.env.NODE_ENV === 'production'

type EndImpersonationResponse = {
  token: string
  expiresIn: number
}

function baseCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isProd,
    path: '/'
  }
}

function flagCookieOptions() {
  return {
    httpOnly: false,
    sameSite: 'lax' as const,
    secure: isProd,
    path: '/'
  }
}

export async function POST() {
  const apiBaseUrl =
    process.env.API_BASE_URL ?? 'http://localhost:9999'
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(AUTH_COOKIES.access)?.value

  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const response = await fetch(`${apiBaseUrl}/admin/impersonate/end`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  const payloadText = await response.text()
  const parsed = parseBackendPayload(payloadText)

  if (!response.ok) {
    return NextResponse.json(
      {
        message: parsed.errorMessage || 'Failed to end impersonation.',
        error: parsed.errorPayload
      },
      { status: response.status }
    )
  }

  const data = (parsed.data ?? {}) as EndImpersonationResponse
  if (!data.token) {
    return NextResponse.json(
      { message: 'Invalid impersonation response.' },
      { status: 502 }
    )
  }
  const expiresIn = Number(data.expiresIn) > 0 ? Number(data.expiresIn) : 900
  const accessExpires = String(Date.now() + expiresIn * 1000)

  const adminRefresh = cookieStore.get(IMPERSONATION_COOKIES.adminRefresh)?.value
  const adminRefreshExpiresAt =
    cookieStore.get(IMPERSONATION_COOKIES.adminRefreshExpiresAt)?.value
  const adminRemember = cookieStore.get(IMPERSONATION_COOKIES.adminRemember)?.value

  const nextResponse = NextResponse.json(data)

  nextResponse.cookies.set(AUTH_COOKIES.access, data.token, {
    ...baseCookieOptions(),
    maxAge: expiresIn
  })
  nextResponse.cookies.set(AUTH_COOKIES.accessExpiresAt, accessExpires, {
    ...baseCookieOptions(),
    maxAge: expiresIn
  })

  let refreshMaxAge: number | undefined
  if (adminRemember === 'true' && adminRefreshExpiresAt) {
    const remainingSeconds = Math.floor(
      (Number(adminRefreshExpiresAt) - Date.now()) / 1000
    )
    if (Number.isFinite(remainingSeconds) && remainingSeconds > 0) {
      refreshMaxAge = remainingSeconds
    }
  }

  if (adminRefresh) {
    nextResponse.cookies.set(AUTH_COOKIES.refresh, adminRefresh, {
      ...baseCookieOptions(),
      ...(refreshMaxAge ? { maxAge: refreshMaxAge } : {})
    })
  } else {
    nextResponse.cookies.set(AUTH_COOKIES.refresh, '', {
      ...baseCookieOptions(),
      maxAge: 0
    })
  }

  if (adminRefreshExpiresAt) {
    nextResponse.cookies.set(
      AUTH_COOKIES.refreshExpiresAt,
      adminRefreshExpiresAt,
      {
        ...baseCookieOptions(),
        ...(refreshMaxAge ? { maxAge: refreshMaxAge } : {})
      }
    )
  } else {
    nextResponse.cookies.set(AUTH_COOKIES.refreshExpiresAt, '', {
      ...baseCookieOptions(),
      maxAge: 0
    })
  }

  if (adminRemember) {
    nextResponse.cookies.set(AUTH_COOKIES.remember, adminRemember, {
      ...baseCookieOptions(),
      ...(refreshMaxAge ? { maxAge: refreshMaxAge } : {})
    })
  } else {
    nextResponse.cookies.set(AUTH_COOKIES.remember, 'false', {
      ...baseCookieOptions(),
      maxAge: 0
    })
  }

  Object.values(IMPERSONATION_COOKIES).forEach((name) => {
    nextResponse.cookies.set(name, '', {
      ...baseCookieOptions(),
      maxAge: 0
    })
  })
  Object.values(IMPERSONATION_COOKIES).forEach((name) => {
    nextResponse.cookies.set(name, '', {
      ...flagCookieOptions(),
      maxAge: 0
    })
  })

  return nextResponse
}
