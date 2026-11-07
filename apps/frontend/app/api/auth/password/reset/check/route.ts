import { backendFetch } from '@/lib/backend-fetch'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { AUTH_COOKIES } from '@/lib/auth'
import { parseBackendPayload } from '@/lib/backend-response'

// Whether a reset link still works and whether it is for the user signed in on this device.
export async function POST(request: Request) {
  const apiBaseUrl =
    process.env.API_BASE_URL ?? 'http://localhost:9999'

  const body = await request.json().catch(() => null) as { token?: string } | null
  if (!body?.token) {
    return NextResponse.json({ message: 'Corpo richiesta non valido.' }, { status: 400 })
  }

  const cookieStore = await cookies()
  const accessToken = cookieStore.get(AUTH_COOKIES.access)?.value
  const signedIn = Boolean(accessToken || cookieStore.get(AUTH_COOKIES.refresh)?.value)

  const response = await backendFetch(`${apiBaseUrl}/auth/password/reset/check`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
    },
    body: JSON.stringify({ token: body.token })
  })

  const parsed = parseBackendPayload(await response.text())
  if (!response.ok) {
    return NextResponse.json(
      { message: parsed.errorMessage || 'Impossibile controllare il link.' },
      { status: response.status }
    )
  }

  const data = (parsed.data ?? {}) as { valid?: boolean, sameUser?: boolean }
  return NextResponse.json({ valid: Boolean(data.valid), sameUser: Boolean(data.sameUser), signedIn })
}
