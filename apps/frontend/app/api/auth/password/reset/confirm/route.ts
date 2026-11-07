import { backendFetch } from '@/lib/backend-fetch'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { AUTH_COOKIES } from '@/lib/auth'
import { parseBackendPayload } from '@/lib/backend-response'

export async function POST(request: Request) {
  const apiBaseUrl =
    process.env.API_BASE_URL ?? 'http://localhost:9999'

  let body: { token?: string; password?: string } | null = null

  try {
    body = (await request.json()) as { token?: string; password?: string }
  } catch {
    return NextResponse.json(
      { message: 'Corpo richiesta non valido.' },
      { status: 400 }
    )
  }

  const response = await backendFetch(`${apiBaseUrl}/auth/password/reset/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      token: body?.token,
      password: body?.password,
      // This device stays signed in when the link is for its own user; the backend checks that.
      keepRefreshToken: (await cookies()).get(AUTH_COOKIES.refresh)?.value
    })
  })

  const payload = await response.text()
  const parsed = parseBackendPayload(payload)

  if (!response.ok) {
    return NextResponse.json(
      {
        message: parsed.errorMessage || 'Reset non riuscito.',
        error: parsed.errorPayload
      },
      { status: response.status }
    )
  }

  return NextResponse.json(parsed.data ?? {})
}
