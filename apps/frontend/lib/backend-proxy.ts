import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { AUTH_COOKIES } from '@/lib/auth'
import { backendFetch } from '@/lib/backend-fetch'
import { parseBackendPayload } from '@/lib/backend-response'

// For route handlers that only pass a request through to the backend as the signed-in user.
export async function forwardToBackend(path: string, init: { method: string, body?: string } = { method: 'GET' }) {
  const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:9999'
  const accessToken = (await cookies()).get(AUTH_COOKIES.access)?.value

  if (!accessToken) {
    return NextResponse.json({ message: 'Sessione scaduta. Accedi di nuovo.' }, { status: 401 })
  }

  const response = await backendFetch(`${apiBaseUrl}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    body: init.body,
    cache: 'no-store'
  })

  if (response.status === 204) {
    return new NextResponse(null, { status: 204 })
  }

  const parsed = parseBackendPayload(await response.text())
  if (!response.ok) {
    return NextResponse.json(
      { message: parsed.errorMessage || 'Richiesta non riuscita.', error: parsed.errorPayload },
      { status: response.status }
    )
  }
  return NextResponse.json(parsed.data ?? {})
}
