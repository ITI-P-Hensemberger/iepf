import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { AUTH_COOKIES } from '@/lib/auth'
import { backendFetch } from '@/lib/backend-fetch'
import { parseBackendPayload } from '@/lib/backend-response'

export const dynamic = 'force-dynamic'

// Passes the backend's event stream through as it comes. The browser's abort reaches the
// backend through the signal, so a closed tab frees its stream there too.
export async function GET(request: Request) {
  const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:9999'
  const accessToken = (await cookies()).get(AUTH_COOKIES.access)?.value
  if (!accessToken) {
    return NextResponse.json({ message: 'Sessione scaduta. Accedi di nuovo.' }, { status: 401 })
  }

  let upstream: Response
  try {
    upstream = await backendFetch(`${apiBaseUrl}/notifications/inbox/stream`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'text/event-stream' },
      cache: 'no-store',
      signal: request.signal
    })
  }
  catch {
    return NextResponse.json({ message: 'Servizio non disponibile.' }, { status: 503 })
  }

  if (!upstream.ok || !upstream.body) {
    const parsed = parseBackendPayload(await upstream.text())
    return NextResponse.json(
      { message: parsed.errorMessage || 'Richiesta non riuscita.' },
      { status: upstream.ok ? 502 : upstream.status }
    )
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      // no-transform keeps any compression from holding events back.
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no'
    }
  })
}
