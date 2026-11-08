import { backendFetch } from '@/lib/backend-fetch'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { parseBackendPayload } from '@/lib/backend-response'
import { AUTH_COOKIES, IMPERSONATION_COOKIES } from '@/lib/auth'

const isProd = process.env.NODE_ENV === 'production'

type ImpersonateResponse = {
  token: string
  expiresIn: number
  impersonatedUser: {
    id: string
    email?: string
    role: string
  }
}

type ImpersonateRequest = {
  userId?: string
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

export async function POST(
  request: Request
) {
  const apiBaseUrl =
    process.env.API_BASE_URL ?? 'http://localhost:9999'
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(AUTH_COOKIES.access)?.value
  const refreshToken = cookieStore.get(AUTH_COOKIES.refresh)?.value
  const accessExpiresAt = cookieStore.get(AUTH_COOKIES.accessExpiresAt)?.value
  const refreshExpiresAt = cookieStore.get(AUTH_COOKIES.refreshExpiresAt)?.value
  const remember = cookieStore.get(AUTH_COOKIES.remember)?.value

  if (!accessToken) {
    return NextResponse.json({ message: 'Sessione scaduta. Accedi di nuovo.' }, { status: 401 })
  }

  let body: ImpersonateRequest | null = null

  try {
    body = (await request.json()) as ImpersonateRequest
  } catch {
    return NextResponse.json({ message: 'Corpo richiesta non valido.' }, { status: 400 })
  }

  if (!body?.userId) {
    return NextResponse.json({ message: 'userId is required.' }, { status: 422 })
  }

  const response = await backendFetch(`${apiBaseUrl}/admin/impersonate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ userId: body.userId })
  })

  const payloadText = await response.text()
  const parsed = parseBackendPayload(payloadText)

  if (!response.ok) {
    return NextResponse.json(
      {
        message: parsed.errorMessage || "Impossibile avviare l'impersonazione.",
        error: parsed.errorPayload
      },
      { status: response.status }
    )
  }

  const data = (parsed.data ?? {}) as ImpersonateResponse
  if (!data.token) {
    return NextResponse.json(
      { message: 'Risposta del server non valida.' },
      { status: 502 }
    )
  }
  const expiresIn = Number(data.expiresIn) > 0 ? Number(data.expiresIn) : 900
  const accessExpires = String(Date.now() + expiresIn * 1000)

  const nextResponse = NextResponse.json(data)

  if (accessToken) {
    nextResponse.cookies.set(
      IMPERSONATION_COOKIES.adminAccess,
      accessToken,
      baseCookieOptions()
    )
  }
  if (refreshToken) {
    nextResponse.cookies.set(
      IMPERSONATION_COOKIES.adminRefresh,
      refreshToken,
      baseCookieOptions()
    )
  }
  if (accessExpiresAt) {
    nextResponse.cookies.set(
      IMPERSONATION_COOKIES.adminAccessExpiresAt,
      accessExpiresAt,
      baseCookieOptions()
    )
  }
  if (refreshExpiresAt) {
    nextResponse.cookies.set(
      IMPERSONATION_COOKIES.adminRefreshExpiresAt,
      refreshExpiresAt,
      baseCookieOptions()
    )
  }
  if (remember) {
    nextResponse.cookies.set(
      IMPERSONATION_COOKIES.adminRemember,
      remember,
      baseCookieOptions()
    )
  }

  nextResponse.cookies.set(AUTH_COOKIES.access, data.token, {
    ...baseCookieOptions(),
    maxAge: expiresIn
  })
  nextResponse.cookies.set(AUTH_COOKIES.accessExpiresAt, accessExpires, {
    ...baseCookieOptions(),
    maxAge: expiresIn
  })
  nextResponse.cookies.set(AUTH_COOKIES.refresh, '', {
    ...baseCookieOptions(),
    maxAge: 0
  })
  nextResponse.cookies.set(AUTH_COOKIES.refreshExpiresAt, '', {
    ...baseCookieOptions(),
    maxAge: 0
  })
  nextResponse.cookies.set(AUTH_COOKIES.remember, 'false', {
    ...baseCookieOptions(),
    maxAge: expiresIn
  })

  nextResponse.cookies.set(IMPERSONATION_COOKIES.active, 'true', {
    ...flagCookieOptions(),
    maxAge: expiresIn
  })
  if (data.impersonatedUser?.id) {
    nextResponse.cookies.set(
      IMPERSONATION_COOKIES.impersonatedId,
      data.impersonatedUser.id,
      { ...flagCookieOptions(), maxAge: expiresIn }
    )
  }
  if (data.impersonatedUser?.role) {
    nextResponse.cookies.set(
      IMPERSONATION_COOKIES.impersonatedRole,
      data.impersonatedUser.role,
      { ...flagCookieOptions(), maxAge: expiresIn }
    )
  }
  if (data.impersonatedUser?.email) {
    nextResponse.cookies.set(
      IMPERSONATION_COOKIES.impersonatedEmail,
      data.impersonatedUser.email,
      { ...flagCookieOptions(), maxAge: expiresIn }
    )
  }

  return nextResponse
}
